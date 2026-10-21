package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.asset.entity.AssetImage;
import com.legacyvault.asset.repository.AssetImageRepository;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.asset.service.AssetImageService;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.auth.JwtService;
import com.legacyvault.common.crypto.EncryptionService;

/**
 * PS-104 on a real SQL Server: a Beneficiary account reads exactly the handover items Staff delivered to its linked
 * Beneficiary records, from several Vaults, after archive or hold, and only with the login password for content.
 */
class ReceivedAssetSqlServerTest extends HandoverCompletionSqlSupport {
	private static final String PASSWORD = "Received-Pass-1";
	private static final String SECRET = "recipient-secret-payload";
	private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4 };
	private static final ObjectMapper JSON = new ObjectMapper();

	record Account(long id, String token) { }

	private MockHttpServletResponse call(MockMvc mvc, String method, String url, Account who, String body) throws Exception {
		var request = "POST".equals(method) ? post(url).contentType(MediaType.APPLICATION_JSON).content(body) : get(url);
		if (who != null) request.header("Authorization", "Bearer " + who.token());
		return mvc.perform(request).andReturn().getResponse();
	}

	private MockMvc mvc() {
		return MockMvcBuilders.webAppContextSetup((WebApplicationContext) context).apply(springSecurity()).build();
	}

	private Account account(String role) {
		UUID pub = UUID.randomUUID();
		String email = pub + "@example.test";
		long id = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES(?,'Recipient',?,?,'ACTIVE')",
				Long.class, pub.toString(), email, new BCryptPasswordEncoder().encode(PASSWORD));
		jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code=?", id, role);
		return new Account(id, context.getBean(JwtService.class).generateAccessToken(pub, email, List.of(role)));
	}

	private void link(Ready ready, Account account) {
		jdbc.update("UPDATE dbo.beneficiaries SET linked_user_id=?, account_status='ACCOUNT_CREATED' WHERE public_id=?", account.id(), ready.recipient().toString());
	}

	private String itemId(Ready ready) {
		return jdbc.queryForObject("SELECT CAST(hi.public_id AS NVARCHAR(36)) FROM dbo.handover_items hi JOIN dbo.beneficiaries b ON b.beneficiary_id=hi.beneficiary_id WHERE b.public_id=?",
				String.class, ready.recipient().toString()).toLowerCase();
	}

	/** Gives the delivered asset an encrypted payload and one encrypted image, exactly as the Owner paths would store them. */
	private UUID prepareContent(Ready ready) {
		var enc = context.getBean(EncryptionService.class);
		var assetRepo = context.getBean(AssetRepository.class);
		var imageRepo = context.getBean(AssetImageRepository.class);
		long assetDbId = jdbc.queryForObject("SELECT asset_id FROM dbo.assets WHERE public_id=?", Long.class, ready.asset().toString());
		UUID[] imageId = new UUID[1];
		tx.execute(status -> {
			var asset = assetRepo.findById(assetDbId).orElseThrow();
			asset.setEncryptedPayload(enc.encrypt(SECRET, AssetService.associatedData(asset)));
			assetRepo.saveAndFlush(asset);
			var image = new AssetImage(assetDbId, 1, "photo.png", "image/png", PNG.length);
			image.encrypt(enc.encrypt(PNG, AssetImageService.associatedData(asset.getPublicId(), image.getPublicId())));
			imageRepo.saveAndFlush(image);
			imageId[0] = image.getPublicId();
			return null;
		});
		return imageId[0];
	}

	@Test
	void anAccountSeesOnlyItsOwnDeliveredItems_acrossSeveralVaults_withPaging() throws Exception {
		var mvc = mvc();
		Account a = account("ROLE_BENEFICIARY"), b = account("ROLE_BENEFICIARY"), nobody = account("ROLE_BENEFICIARY");
		Ready first = ready(true), second = ready(true), foreign = ready(true);
		link(first, a); link(second, a); link(foreign, b);

		var page = call(mvc, "GET", "/api/v1/received-assets?size=1", a, null);
		assertEquals(200, page.getStatus(), page.getContentAsString());
		assertTrue(page.getHeader("Cache-Control").contains("no-store"));
		JsonNode body = JSON.readTree(page.getContentAsString());
		assertEquals(2, body.get("totalElements").asInt());
		assertEquals(2, body.get("totalPages").asInt());
		assertEquals(1, body.get("content").size());
		JsonNode newest = body.get("content").get(0);
		assertEquals(itemId(second), newest.get("itemId").asText(), "newest delivery first");
		assertEquals(second.asset().toString(), newest.get("assetId").asText());
		assertEquals("DELIVERED", newest.get("status").asText());
		assertEquals("Legal fixture", newest.get("vaultName").asText());
		assertNotEquals(first.f().publicCaseId().toString(), newest.get("vaultId").asText());
		var secondPage = JSON.readTree(call(mvc, "GET", "/api/v1/received-assets?size=1&page=1", a, null).getContentAsString());
		assertEquals(itemId(first), secondPage.get("content").get(0).get("itemId").asText());
		assertFalse(page.getContentAsString().contains(foreign.asset().toString()), "another recipient's asset is never listed");

		assertEquals(0, JSON.readTree(call(mvc, "GET", "/api/v1/received-assets", nobody, null).getContentAsString()).get("totalElements").asInt());
		assertEquals(404, call(mvc, "GET", "/api/v1/received-assets/" + itemId(foreign), a, null).getStatus());
		assertEquals(404, call(mvc, "GET", "/api/v1/received-assets/" + UUID.randomUUID(), a, null).getStatus());
		assertEquals(200, call(mvc, "GET", "/api/v1/received-assets/" + itemId(first), a, null).getStatus());
		assertEquals(400, call(mvc, "GET", "/api/v1/received-assets?size=1000", a, null).getStatus());
	}

	@Test
	void anAllocatedButUndeliveredAssetIsInvisibleUntilStaffDeliversIt() throws Exception {
		var mvc = mvc();
		Account a = account("ROLE_BENEFICIARY");
		Ready pending = ready(false);
		link(pending, a);
		assertEquals(0, JSON.readTree(call(mvc, "GET", "/api/v1/received-assets", a, null).getContentAsString()).get("totalElements").asInt());
		deliver(pending);
		var listed = JSON.readTree(call(mvc, "GET", "/api/v1/received-assets", a, null).getContentAsString());
		assertEquals(1, listed.get("totalElements").asInt());
		assertEquals(pending.asset().toString(), listed.get("content").get(0).get("assetId").asText());
	}

	@Test
	void contentAndImagesNeedThePassword_areAuditedWithoutContent_andShareTheAttemptLimit() throws Exception {
		var mvc = mvc();
		Account a = account("ROLE_BENEFICIARY"), other = account("ROLE_BENEFICIARY");
		Ready ready = ready(true);
		link(ready, a);
		UUID imageId = prepareContent(ready);
		String item = itemId(ready);
		String base = "/api/v1/received-assets/" + item;

		var detail = JSON.readTree(call(mvc, "GET", base, a, null).getContentAsString());
		assertTrue(detail.get("hasContent").asBoolean());
		assertEquals(1, detail.get("imageCount").asInt());
		assertFalse(detail.toString().contains(SECRET), "detail never carries content");

		var wrong = call(mvc, "POST", base + "/content", a, "{\"password\":\"nope\"}");
		assertEquals(403, wrong.getStatus());
		assertTrue(wrong.getContentAsString().contains("REAUTH_FAILED"));
		var ok = call(mvc, "POST", base + "/content", a, "{\"password\":\"" + PASSWORD + "\"}");
		assertEquals(200, ok.getStatus(), ok.getContentAsString());
		assertEquals(SECRET, JSON.readTree(ok.getContentAsString()).get("payload").asText());
		assertTrue(ok.getHeader("Cache-Control").contains("no-store"));
		assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE actor_user_id=? AND action='RECEIVED_ASSET_OPENED'", Integer.class, a.id()));
		String audit = jdbc.queryForObject("SELECT CAST(details AS NVARCHAR(MAX)) FROM dbo.audit_logs WHERE actor_user_id=? AND action='RECEIVED_ASSET_OPENED'", String.class, a.id());
		assertFalse(audit.contains(SECRET));

		var images = JSON.readTree(call(mvc, "GET", base + "/images", a, null).getContentAsString());
		assertEquals(1, images.size());
		assertEquals(imageId.toString(), images.get(0).get("id").asText());
		var image = call(mvc, "POST", base + "/images/" + imageId + "/download", a, "{\"password\":\"" + PASSWORD + "\"}");
		assertEquals(200, image.getStatus());
		assertArrayEquals(PNG, image.getContentAsByteArray());
		assertEquals("image/png", image.getContentType());
		assertEquals("nosniff", image.getHeader("X-Content-Type-Options"));

		assertEquals(404, call(mvc, "POST", base + "/content", other, "{\"password\":\"" + PASSWORD + "\"}").getStatus());
		assertEquals(404, call(mvc, "GET", base + "/images", other, null).getStatus());
		assertEquals(404, call(mvc, "POST", base + "/images/" + UUID.randomUUID() + "/download", a, "{\"password\":\"" + PASSWORD + "\"}").getStatus());

		Account limited = account("ROLE_BENEFICIARY");
		Ready second = ready(true);
		link(second, limited);
		String limitedBase = "/api/v1/received-assets/" + itemId(second);
		for (int i = 0; i < 5; i++) assertEquals(403, call(mvc, "POST", limitedBase + "/content", limited, "{\"password\":\"wrong-" + i + "\"}").getStatus());
		assertEquals(429, call(mvc, "POST", limitedBase + "/content", limited, "{\"password\":\"" + PASSWORD + "\"}").getStatus(), "limit holds even for the right password");
	}

	@Test
	void deliveredItemsStayReadableAfterArchiveOrHold_andOnlyBeneficiaryAccountsMayCall() throws Exception {
		var mvc = mvc();
		Account a = account("ROLE_BENEFICIARY");
		Ready archived = ready(true), held = ready(true);
		link(archived, a); link(held, a);
		prepareContent(archived);
		prepareContent(held);
		jdbc.update("UPDATE dbo.vaults SET status='ARCHIVED' WHERE vault_id=?", archived.f().vaultId());
		jdbc.update("UPDATE dbo.vaults SET status='ON_HOLD' WHERE vault_id=?", held.f().vaultId());

		assertEquals(2, JSON.readTree(call(mvc, "GET", "/api/v1/received-assets", a, null).getContentAsString()).get("totalElements").asInt());
		for (Ready r : List.of(archived, held)) {
			var content = call(mvc, "POST", "/api/v1/received-assets/" + itemId(r) + "/content", a, "{\"password\":\"" + PASSWORD + "\"}");
			assertEquals(200, content.getStatus(), content.getContentAsString());
			assertEquals(SECRET, JSON.readTree(content.getContentAsString()).get("payload").asText());
		}

		assertEquals(403, call(mvc, "GET", "/api/v1/received-assets", account("ROLE_VAULT_OWNER"), null).getStatus());
		assertEquals(403, call(mvc, "GET", "/api/v1/received-assets", account("ROLE_STAFF_EXECUTOR"), null).getStatus());
		assertEquals(401, call(mvc, "GET", "/api/v1/received-assets", null, null).getStatus());
	}
}
