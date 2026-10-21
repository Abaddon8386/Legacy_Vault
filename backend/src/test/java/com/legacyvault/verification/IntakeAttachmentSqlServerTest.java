package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.auth.JwtService;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisForwardService;

/**
 * PS-103 (D-API-41) on a real SQL Server: Staff uploads files to death documents and the original will, Staff and Legal read
 * them, content stays encrypted at rest and every read is audited. Also reads of legal-basis version files.
 */
class IntakeAttachmentSqlServerTest extends HandoverCompletionSqlSupport {
	private static final byte[] PDF = "%PDF-1.4\nIntake attachment fixture\n%%EOF".getBytes(StandardCharsets.UTF_8);
	private static final ObjectMapper JSON = new ObjectMapper();

	record Actor(long id, UUID publicId, String token) { }

	private MockMvc mvc() {
		return MockMvcBuilders.webAppContextSetup((WebApplicationContext) context).apply(springSecurity()).build();
	}

	private Actor withRole(long userId, UUID publicId, String email, String role) {
		jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code=?", userId, role);
		return new Actor(userId, publicId, context.getBean(JwtService.class).generateAccessToken(publicId, email, List.of(role)));
	}

	private Actor extraUser(String role) {
		UUID pub = UUID.randomUUID();
		long id = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES(?,'Intake user',?,'x','ACTIVE')",
				Long.class, pub.toString(), pub + "@example.test");
		return withRole(id, pub, pub + "@example.test", role);
	}

	private Actor staffOf(Fixture f) {
		return withRole(f.userId(), f.legal().publicId(), f.legal().email(), "ROLE_STAFF_EXECUTOR");
	}

	private UUID deathRecord(Fixture f) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT dbo.death_document_records(public_id,verification_case_id,document_type,issuing_authority,document_number,issued_date,received_by_user_id) VALUES(?,?,'DEATH_CERTIFICATE','Authority','DC-1','2026-01-01',?)",
				id.toString(), f.caseId(), f.userId());
		return id;
	}

	private UUID willIntake(Fixture f) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT dbo.original_will_intakes(public_id,verification_case_id,delivered_by_name,received_by_user_id) VALUES(?,?,'Deliverer',?)",
				id.toString(), f.caseId(), f.userId());
		return id;
	}

	private MockHttpServletResponse upload(String url, Actor who, byte[] bytes, String name, String type) throws Exception {
		return mvc().perform(multipart(url).file(new MockMultipartFile("file", name, type, bytes))
				.header("Authorization", "Bearer " + who.token())).andReturn().getResponse();
	}

	private MockHttpServletResponse read(String url, Actor who) throws Exception {
		return mvc().perform(get(url).header("Authorization", "Bearer " + who.token())).andReturn().getResponse();
	}

	/** The audit table is shared by every test of this class, so always count per actor. */
	private int audit(String action, long actorUserId) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE action=? AND actor_user_id=?", Integer.class, action, actorUserId);
	}

	private static String sha256(byte[] bytes) throws Exception {
		return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
	}

	@Test
	void deathDocumentFileIsEncryptedAtRest_readableByStaffAndLegal_andEveryReadIsAudited() throws Exception {
		Fixture f = fixture(false);
		Actor staff = staffOf(f);
		UUID record = deathRecord(f);
		String base = "/api/v1/staff/verification-cases/" + f.publicCaseId() + "/death-documents/" + record + "/attachments";

		var created = upload(base, staff, PDF, "so-khai-tu.pdf", "application/pdf");
		assertEquals(201, created.getStatus(), created.getContentAsString());
		JsonNode meta = JSON.readTree(created.getContentAsString());
		assertEquals("DEATH_DOCUMENT", meta.get("subjectType").asText());
		assertEquals(sha256(PDF), meta.get("sha256").asText());
		assertEquals(PDF.length, meta.get("sizeBytes").asLong());
		assertEquals("application/pdf", meta.get("contentType").asText());
		assertFalse(created.getContentAsString().contains("Intake attachment fixture"));
		String attachmentId = meta.get("id").asText();

		byte[] stored = jdbc.queryForObject("SELECT encrypted_file_content FROM dbo.staff_intake_attachments WHERE public_id=?",
				byte[].class, attachmentId);
		assertFalse(new String(stored, StandardCharsets.ISO_8859_1).contains("Intake attachment fixture"));
		assertEquals(1, audit("INTAKE_ATTACHMENT_UPLOADED", staff.id()));
		String uploadAudit = jdbc.queryForObject("SELECT CAST(details AS NVARCHAR(MAX)) FROM dbo.audit_logs WHERE action='INTAKE_ATTACHMENT_UPLOADED' AND actor_user_id=?", String.class, staff.id());
		assertFalse(uploadAudit.contains("so-khai-tu"));

		assertEquals(1, JSON.readTree(read(base, staff).getContentAsString()).size());
		var content = read(base + "/" + attachmentId + "/content", staff);
		assertEquals(200, content.getStatus());
		assertArrayEquals(PDF, content.getContentAsByteArray());
		assertEquals("nosniff", content.getHeader("X-Content-Type-Options"));
		assertTrue(content.getHeader("Cache-Control").contains("no-store"));
		assertTrue(content.getHeader("Content-Disposition").startsWith("attachment"));
		assertEquals(1, audit("EVIDENCE_FILE_READ", staff.id()));

		Actor legal = extraUser("ROLE_LEGAL_VERIFIER");
		String legalBase = "/api/v1/legal-verifications/death-documents/" + record + "/attachments";
		assertEquals(1, JSON.readTree(read(legalBase, legal).getContentAsString()).size());
		var legalContent = read(legalBase + "/" + attachmentId + "/content", legal);
		assertEquals(200, legalContent.getStatus());
		assertArrayEquals(PDF, legalContent.getContentAsByteArray());
		assertEquals(1, audit("EVIDENCE_FILE_READ", legal.id()));
		assertEquals(1, audit("EVIDENCE_FILE_READ", staff.id()));
	}

	@Test
	void originalWillFileCanBeAttachedAndReadByStaffAndLegal() throws Exception {
		Fixture f = fixture(false);
		Actor staff = staffOf(f);
		UUID intake = willIntake(f);
		String base = "/api/v1/staff/verification-cases/" + f.publicCaseId() + "/original-will-intakes/" + intake + "/attachments";
		byte[] jpeg = new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3, 4 };

		var created = upload(base, staff, jpeg, "trang-1.jpg", "image/jpeg");
		assertEquals(201, created.getStatus(), created.getContentAsString());
		String id = JSON.readTree(created.getContentAsString()).get("id").asText();
		assertEquals("ORIGINAL_WILL", JSON.readTree(created.getContentAsString()).get("subjectType").asText());
		assertArrayEquals(jpeg, read(base + "/" + id + "/content", staff).getContentAsByteArray());

		Actor legal = extraUser("ROLE_LEGAL_VERIFIER");
		String legalBase = "/api/v1/legal-verifications/verification-cases/" + f.publicCaseId() + "/original-will-intakes/" + intake + "/attachments";
		assertEquals(1, JSON.readTree(read(legalBase, legal).getContentAsString()).size());
		assertArrayEquals(jpeg, read(legalBase + "/" + id + "/content", legal).getContentAsByteArray());
	}

	@Test
	void invalidFilesAreRejected_andTheLimitPerRecordIsEnforced() throws Exception {
		Fixture f = fixture(false);
		Actor staff = staffOf(f);
		String base = "/api/v1/staff/verification-cases/" + f.publicCaseId() + "/death-documents/" + deathRecord(f) + "/attachments";
		assertEquals(415, upload(base, staff, "plain text".getBytes(StandardCharsets.UTF_8), "a.pdf", "application/pdf").getStatus());
		assertEquals(415, upload(base, staff, PDF, "a.png", "image/png").getStatus());
		assertEquals(400, upload(base, staff, new byte[0], "empty.pdf", "application/pdf").getStatus());
		assertEquals(400, mvc().perform(multipart(base).header("Authorization", "Bearer " + staff.token())).andReturn().getResponse().getStatus());
		for (int i = 0; i < 10; i++) assertEquals(201, upload(base, staff, PDF, "p" + i + ".pdf", "application/pdf").getStatus());
		var eleventh = upload(base, staff, PDF, "p11.pdf", "application/pdf");
		assertEquals(409, eleventh.getStatus());
		assertTrue(eleventh.getContentAsString().contains("INTAKE_ATTACHMENT_LIMIT_EXCEEDED"));
		assertEquals(10, jdbc.queryForObject("SELECT COUNT(*) FROM dbo.staff_intake_attachments WHERE verification_case_id=?", Integer.class, f.caseId()));
	}

	@Test
	void onlyTheAssignedStaffCanUploadOrReadStaffEndpoints_closedCaseIsReadOnly_andRowsAreImmutable() throws Exception {
		Fixture f = fixture(false);
		Actor staff = staffOf(f);
		UUID record = deathRecord(f);
		String base = "/api/v1/staff/verification-cases/" + f.publicCaseId() + "/death-documents/" + record + "/attachments";
		String id = JSON.readTree(upload(base, staff, PDF, "a.pdf", "application/pdf").getContentAsString()).get("id").asText();

		Actor otherStaff = extraUser("ROLE_STAFF_EXECUTOR");
		assertEquals(404, upload(base, otherStaff, PDF, "a.pdf", "application/pdf").getStatus());
		assertEquals(404, read(base, otherStaff).getStatus());
		assertEquals(404, read(base + "/" + id + "/content", otherStaff).getStatus());
		Actor owner = extraUser("ROLE_VAULT_OWNER");
		assertEquals(403, upload(base, owner, PDF, "a.pdf", "application/pdf").getStatus());
		assertEquals(403, read(base, owner).getStatus());
		assertEquals(403, read("/api/v1/legal-verifications/death-documents/" + record + "/attachments", staff).getStatus());
		assertEquals(404, read(base + "/" + UUID.randomUUID() + "/content", staff).getStatus());

		jdbc.update("UPDATE dbo.verification_cases SET status='CANCELLED', closed_at=SYSUTCDATETIME() WHERE verification_case_id=?", f.caseId());
		assertEquals(409, upload(base, staff, PDF, "late.pdf", "application/pdf").getStatus());
		assertEquals(200, read(base + "/" + id + "/content", staff).getStatus());

		assertThrows(Exception.class, () -> jdbc.update("UPDATE dbo.staff_intake_attachments SET original_file_name='tamper'"));
		assertThrows(Exception.class, () -> jdbc.update("DELETE dbo.staff_intake_attachments"));
	}

	@Test
	void basisVersionFile_staffReadsAnyVersion_legalOnlyAfterForward_unknownVersionIs404() throws Exception {
		Fixture f = fixture(true);
		Actor staff = staffOf(f);
		context.getBean(BasisClassificationService.class).classify(f.publicCaseId(), f.legal(),
				new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT, "Fixture basis"));
		intakeVersion(f, "COURT_JUDGMENT");
		Actor legal = extraUser("ROLE_LEGAL_VERIFIER");
		String staffUrl = "/api/v1/staff/verification-cases/" + f.publicCaseId() + "/basis-dossier/versions/1/content";
		String legalUrl = "/api/v1/legal-verifications/verification-cases/" + f.publicCaseId() + "/basis-dossier/versions/1/content";

		var staffRead = read(staffUrl, staff);
		assertEquals(200, staffRead.getStatus());
		assertTrue(new String(staffRead.getContentAsByteArray(), StandardCharsets.UTF_8).startsWith("%PDF-"));
		assertEquals(404, read(legalUrl, legal).getStatus(), "Legal must not read a version that was not forwarded");

		context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 1, f.legal());
		var legalRead = read(legalUrl, legal);
		assertEquals(200, legalRead.getStatus());
		assertArrayEquals(staffRead.getContentAsByteArray(), legalRead.getContentAsByteArray());
		assertEquals(404, read(staffUrl.replace("versions/1", "versions/9"), staff).getStatus());
		assertEquals(400, read(staffUrl.replace("versions/1", "versions/0"), staff).getStatus());
		assertEquals(1, audit("EVIDENCE_FILE_READ", staff.id()));
		assertEquals(1, audit("EVIDENCE_FILE_READ", legal.id()));
	}
}
