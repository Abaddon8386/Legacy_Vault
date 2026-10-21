package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.auth.JwtService;

/**
 * PS-114 (D-API-43) on a real SQL Server: encrypted PDF/DOCX attachments of an Asset, password-protected reads, atomic
 * multi-file upload, the per-asset limit, storage accounting and strict ownership. A Will is never an attachment target.
 */
class AssetDocumentSqlServerTest extends HandoverCompletionSqlSupport {
	private static final String PASSWORD = "Doc-Owner-Pass-1";
	private static final byte[] PDF = "%PDF-1.4\nAsset document fixture\n%%EOF".getBytes(StandardCharsets.UTF_8);
	private static final ObjectMapper JSON = new ObjectMapper();

	record Owner(long id, UUID vaultId, UUID assetId, String token) { }

	private MockMvc mvc() {
		return MockMvcBuilders.webAppContextSetup((WebApplicationContext) context).apply(springSecurity()).build();
	}

	private Owner owner(String vaultStatus) {
		UUID pub = UUID.randomUUID();
		String email = pub + "@example.test";
		long id = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES(?,'Doc Owner',?,?,'ACTIVE')",
				Long.class, pub.toString(), email, new BCryptPasswordEncoder().encode(PASSWORD));
		jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_VAULT_OWNER'", id);
		UUID vault = UUID.fromString(jdbc.queryForObject("INSERT dbo.vaults(owner_user_id,vault_name,status) OUTPUT inserted.public_id VALUES(?,'Doc vault','ACTIVE')",
				String.class, id));
		UUID asset = context.getBean(AssetService.class).createAsset(vault, id, new CreateAssetRequest("Hop dong", "TEXT", null, "payload")).id();
		if (!"ACTIVE".equals(vaultStatus)) jdbc.update("UPDATE dbo.vaults SET status=? WHERE public_id=?", vaultStatus, vault.toString());
		return new Owner(id, vault, asset, context.getBean(JwtService.class).generateAccessToken(pub, email, List.of("ROLE_VAULT_OWNER")));
	}

	private static byte[] docx() throws Exception {
		var out = new ByteArrayOutputStream();
		try (var zip = new ZipOutputStream(out)) {
			for (String name : new String[] { "[Content_Types].xml", "word/document.xml", "_rels/.rels" }) {
				zip.putNextEntry(new ZipEntry(name));
				zip.write("<doc>SECRET-DOCX-BODY</doc>".getBytes(StandardCharsets.UTF_8));
				zip.closeEntry();
			}
		}
		return out.toByteArray();
	}

	private static String sha256(byte[] bytes) throws Exception {
		return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
	}

	private String base(Owner o) {
		return "/api/v1/vaults/" + o.vaultId() + "/assets/" + o.assetId() + "/documents";
	}

	private MockHttpServletResponse upload(Owner o, MockMultipartFile... files) throws Exception {
		var request = multipart(base(o));
		for (var f : files) request.file(f);
		return mvc().perform(request.header("Authorization", "Bearer " + o.token())).andReturn().getResponse();
	}

	private static MockMultipartFile part(String name, String type, byte[] bytes) {
		return new MockMultipartFile("documents", name, type, bytes);
	}

	private MockHttpServletResponse download(Owner o, String documentId, String password) throws Exception {
		return mvc().perform(post(base(o) + "/" + documentId + "/download").header("Authorization", "Bearer " + o.token())
				.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"" + password + "\"}")).andReturn().getResponse();
	}

	private long storageBytes(Owner o) throws Exception {
		var response = mvc().perform(get("/api/v1/subscriptions/me").header("Authorization", "Bearer " + o.token())).andReturn().getResponse();
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return JSON.readTree(response.getContentAsString()).get("usage").get("storageBytes").asLong();
	}

	private int audit(Owner o, String action) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE actor_user_id=? AND action=?", Integer.class, o.id(), action);
	}

	@Test
	void uploadEncryptsAtRest_listsMetadata_andDownloadNeedsThePassword() throws Exception {
		Owner o = owner("ACTIVE");
		long before = storageBytes(o);
		byte[] docx = docx();
		var created = upload(o, part("hop-dong.pdf", "application/pdf", PDF), part("mau.docx",
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx));
		assertEquals(201, created.getStatus(), created.getContentAsString());
		JsonNode items = JSON.readTree(created.getContentAsString());
		assertEquals(2, items.size());
		assertEquals(sha256(PDF), items.get(0).get("sha256").asText());
		assertEquals("application/pdf", items.get(0).get("contentType").asText());
		assertFalse(created.getContentAsString().contains("Asset document fixture"));
		String pdfId = items.get(0).get("id").asText();

		byte[] stored = jdbc.queryForObject("SELECT encrypted_content FROM dbo.asset_documents WHERE public_id=?", byte[].class, pdfId);
		assertEquals(PDF.length + 16, stored.length, "AES-GCM adds a 16-byte tag");
		assertFalse(new String(stored, StandardCharsets.ISO_8859_1).contains("Asset document fixture"));
		assertEquals(before + PDF.length + docx.length, storageBytes(o), "document bytes count toward storage");
		assertEquals(1, jdbc.queryForObject("SELECT asset_count FROM (SELECT COUNT(*) AS asset_count FROM dbo.assets a JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.owner_user_id=?) x", Integer.class, o.id()),
				"documents never occupy an Asset slot");

		var listed = mvc().perform(get(base(o)).header("Authorization", "Bearer " + o.token())).andReturn().getResponse();
		assertEquals(200, listed.getStatus());
		assertEquals(2, JSON.readTree(listed.getContentAsString()).size());

		var wrong = download(o, pdfId, "wrong-password");
		assertEquals(403, wrong.getStatus());
		assertTrue(wrong.getContentAsString().contains("REAUTH_FAILED"));
		var ok = download(o, pdfId, PASSWORD);
		assertEquals(200, ok.getStatus());
		assertArrayEquals(PDF, ok.getContentAsByteArray());
		assertEquals("application/pdf", ok.getContentType());
		assertEquals("nosniff", ok.getHeader("X-Content-Type-Options"));
		assertTrue(ok.getHeader("Cache-Control").contains("no-store"));
		assertTrue(ok.getHeader("Content-Disposition").startsWith("attachment"));
		assertEquals(1, audit(o, "ASSET_DOCUMENT_OPENED"));
		assertEquals(2, audit(o, "ASSET_DOCUMENT_ADDED"));
		String addedAudit = jdbc.queryForObject("SELECT TOP 1 CAST(details AS NVARCHAR(MAX)) FROM dbo.audit_logs WHERE actor_user_id=? AND action='ASSET_DOCUMENT_ADDED'", String.class, o.id());
		assertFalse(addedAudit.contains("hop-dong"), "audit carries no file names");
	}

	@Test
	void invalidFilesAreRejected_andAMultiFileRequestIsAllOrNothing() throws Exception {
		Owner o = owner("ACTIVE");
		assertEquals(415, upload(o, part("x.pdf", "application/pdf", "not a pdf".getBytes(StandardCharsets.UTF_8))).getStatus());
		assertEquals(415, upload(o, part("m.docm", "application/pdf", zipWithMacro())).getStatus());
		assertEquals(400, upload(o, part("e.pdf", "application/pdf", new byte[0])).getStatus());
		assertEquals(400, mvc().perform(multipart(base(o)).header("Authorization", "Bearer " + o.token())).andReturn().getResponse().getStatus());
		var mixed = upload(o, part("good.pdf", "application/pdf", PDF), part("bad.pdf", "application/pdf", "bad".getBytes(StandardCharsets.UTF_8)));
		assertEquals(415, mixed.getStatus());
		assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM dbo.asset_documents d JOIN dbo.assets a ON a.asset_id=d.asset_id JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.owner_user_id=?", Integer.class, o.id()),
				"the valid file of a failed request must not be stored");
	}

	@Test
	void theFiveDocumentLimitIsEnforcedPerAsset_andDeleteFreesTheSlotAndTheBytes() throws Exception {
		Owner o = owner("ACTIVE");
		long before = storageBytes(o);
		var first = upload(o, part("a.pdf", "application/pdf", PDF), part("b.pdf", "application/pdf", PDF), part("c.pdf", "application/pdf", PDF),
				part("d.pdf", "application/pdf", PDF), part("e.pdf", "application/pdf", PDF));
		assertEquals(201, first.getStatus(), first.getContentAsString());
		var sixth = upload(o, part("f.pdf", "application/pdf", PDF));
		assertEquals(409, sixth.getStatus());
		assertTrue(sixth.getContentAsString().contains("ASSET_DOCUMENT_LIMIT_EXCEEDED"));
		assertEquals(before + 5L * PDF.length, storageBytes(o));

		String id = JSON.readTree(first.getContentAsString()).get(0).get("id").asText();
		var removed = mvc().perform(delete(base(o) + "/" + id).header("Authorization", "Bearer " + o.token())).andReturn().getResponse();
		assertEquals(204, removed.getStatus());
		assertEquals(before + 4L * PDF.length, storageBytes(o));
		assertEquals(404, download(o, id, PASSWORD).getStatus());
		assertEquals(201, upload(o, part("g.pdf", "application/pdf", PDF)).getStatus());
		assertEquals(1, audit(o, "ASSET_DOCUMENT_REMOVED"));
	}

	@Test
	void onlyTheOwnerOfTheVaultCanTouchDocuments_aWillIsNeverATarget_andFrozenVaultsAreReadOnly() throws Exception {
		Owner o = owner("ACTIVE");
		String id = JSON.readTree(upload(o, part("a.pdf", "application/pdf", PDF)).getContentAsString()).get(0).get("id").asText();

		Owner stranger = owner("ACTIVE");
		var foreign = new Owner(stranger.id(), o.vaultId(), o.assetId(), stranger.token());
		assertEquals(404, upload(foreign, part("x.pdf", "application/pdf", PDF)).getStatus());
		assertEquals(404, mvc().perform(get(base(foreign)).header("Authorization", "Bearer " + foreign.token())).andReturn().getResponse().getStatus());
		assertEquals(404, download(foreign, id, PASSWORD).getStatus());

		UUID willId = UUID.fromString(jdbc.queryForObject("SELECT TOP 1 CAST(a.public_id AS NVARCHAR(36)) FROM dbo.assets a JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.owner_user_id=? AND a.asset_type='TEXT'", String.class, o.id()));
		jdbc.update("INSERT dbo.assets(public_id,vault_id,asset_type,title) SELECT ?,vault_id,'DOCUMENT','will.pdf' FROM dbo.vaults WHERE owner_user_id=?", UUID.randomUUID().toString(), o.id());
		String will = jdbc.queryForObject("SELECT TOP 1 CAST(a.public_id AS NVARCHAR(36)) FROM dbo.assets a JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.owner_user_id=? AND a.asset_type='DOCUMENT'", String.class, o.id());
		var willTarget = mvc().perform(multipart("/api/v1/vaults/" + o.vaultId() + "/assets/" + will + "/documents")
				.file(part("w.pdf", "application/pdf", PDF)).header("Authorization", "Bearer " + o.token())).andReturn().getResponse();
		assertEquals(404, willTarget.getStatus(), "a Will is not an Asset attachment target");

		jdbc.update("UPDATE dbo.vaults SET status='GRACE_PERIOD' WHERE public_id=?", o.vaultId().toString());
		assertEquals(409, upload(o, part("late.pdf", "application/pdf", PDF)).getStatus());
		assertEquals(409, download(o, id, PASSWORD).getStatus());
		assertEquals(409, mvc().perform(delete(base(o) + "/" + id).header("Authorization", "Bearer " + o.token())).andReturn().getResponse().getStatus());

		jdbc.update("UPDATE dbo.vaults SET status='ACTIVE' WHERE public_id=?", o.vaultId().toString());
		String staffEmail = UUID.randomUUID() + "@example.test";
		UUID staffPub = UUID.randomUUID();
		long staffId = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES(?,'Staff',?,'x','ACTIVE')", Long.class, staffPub.toString(), staffEmail);
		jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_STAFF_EXECUTOR'", staffId);
		String staffToken = context.getBean(JwtService.class).generateAccessToken(staffPub, staffEmail, List.of("ROLE_STAFF_EXECUTOR"));
		assertEquals(403, mvc().perform(get(base(o)).header("Authorization", "Bearer " + staffToken)).andReturn().getResponse().getStatus());
		assertEquals(401, mvc().perform(get(base(o))).andReturn().getResponse().getStatus());
	}

	@Test
	void storageQuotaBlocksDocumentsThatWouldExceedThePlan_butSmallOnesStillFit() throws Exception {
		Owner o = owner("ACTIVE");
		long filler = 99L * 1024 * 1024;
		jdbc.update("INSERT dbo.asset_documents(asset_id,file_name,content_type,file_size_bytes,sha256_hash,encrypted_content,encryption_iv,key_version) "
				+ "SELECT asset_id,N'filler.pdf',N'application/pdf',?,REPLICATE('0',64),CONVERT(VARBINARY(MAX),REPLICATE(CAST('a' AS VARCHAR(MAX)),?)),0x000000000000000000000000,N'test' FROM dbo.assets WHERE public_id=?",
				filler, filler + 16, o.assetId().toString());
		byte[] twoMib = new byte[2 * 1024 * 1024];
		System.arraycopy(("%PDF-1.4"+(char)10).getBytes(StandardCharsets.UTF_8), 0, twoMib, 0, 9);
		var rejected = upload(o, part("big.pdf", "application/pdf", twoMib));
		assertEquals(409, rejected.getStatus());
		assertTrue(rejected.getContentAsString().contains("STORAGE_QUOTA_EXCEEDED"));
		assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM dbo.asset_documents d JOIN dbo.assets a ON a.asset_id=d.asset_id JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.owner_user_id=?", Integer.class, o.id()));
		assertEquals(201, upload(o, part("small.pdf", "application/pdf", PDF)).getStatus());
		var oversize = new byte[10 * 1024 * 1024 + 1];
		System.arraycopy(("%PDF-1.4"+(char)10).getBytes(StandardCharsets.UTF_8), 0, oversize, 0, 9);
		assertEquals(413, upload(o, part("huge.pdf", "application/pdf", oversize)).getStatus());
	}

	private static byte[] zipWithMacro() throws Exception {
		var out = new ByteArrayOutputStream();
		try (var zip = new ZipOutputStream(out)) {
			for (String name : new String[] { "[Content_Types].xml", "word/document.xml", "word/vbaProject.bin" }) {
				zip.putNextEntry(new ZipEntry(name));
				zip.write("x".getBytes(StandardCharsets.UTF_8));
				zip.closeEntry();
			}
		}
		return out.toByteArray();
	}
}
