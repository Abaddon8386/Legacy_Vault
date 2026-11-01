package com.legacyvault.verification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.auth.JwtService;
import com.legacyvault.verification.dto.AllocationInput;
import com.legacyvault.verification.dto.BasisIntakeMetadata;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.dto.CourtDecisionRequest;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisForwardService;
import com.legacyvault.verification.service.BasisIntakeService;
import com.legacyvault.verification.service.CourtDecisionService;
import com.legacyvault.verification.service.HandoverSessionService;
import com.legacyvault.verification.service.LegalApprovalService;
import com.legacyvault.verification.service.LegalBasisReviewService;
import org.springframework.mock.web.MockMultipartFile;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * PS-122 / PS-125: shared fixture for the whole-group handover on real SQL Server. A case with two approved recipients
 * (A and B), each with a linked account, an open session, and real HTTP calls with one token per role so role and
 * cross-case checks are exercised through the real security chain, not mocks.
 */
abstract class GroupHandoverSqlSupport extends HandoverCompletionSqlSupport {
    static final ObjectMapper JSON = new ObjectMapper();

    record User(long userId, UUID publicId, String email, String token) { }

    /** One prepared case: two recipients, two assets, an OPEN session and every account linked. */
    record Two(Fixture f, UUID session, UUID recA, UUID recB, UUID assetA, UUID assetB, long benA, long benB,
            User staff) {
        String caseId() { return f.publicCaseId().toString(); }
        String sessionId() { return session.toString(); }
    }

    static User user(String role, long existingUserId, UUID existingPublic, String existingEmail) {
        UUID publicId = existingPublic != null ? existingPublic : UUID.randomUUID();
        String email = existingEmail != null ? existingEmail : publicId + "@example.test";
        long id = existingPublic != null ? existingUserId : jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) "
                + "OUTPUT inserted.user_id VALUES(?,?,?,'unused','ACTIVE')", Long.class, publicId.toString(), role + " fixture", email);
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code=?", id, "ROLE_" + role);
        String token = context.getBean(JwtService.class).generateAccessToken(publicId, email, List.of("ROLE_" + role));
        return new User(id, publicId, email, token);
    }

    static User newUser(String role) { return user(role, 0, null, null); }

    static long beneficiary(long vaultId, String name) {
        return jdbc.queryForObject("INSERT dbo.beneficiaries(public_id,vault_id,full_name) OUTPUT inserted.beneficiary_id VALUES(?,?,?)",
                Long.class, UUID.randomUUID().toString(), vaultId, name);
    }

    static long asset(long vaultId, String title) {
        return jdbc.queryForObject("INSERT dbo.assets(public_id,vault_id,asset_type,title) OUTPUT inserted.asset_id VALUES(?,?,'TEXT',?)",
                Long.class, UUID.randomUUID().toString(), vaultId, title);
    }

    static UUID publicId(String table, String column, long id) {
        return UUID.fromString(jdbc.queryForObject("SELECT CONVERT(varchar(36),public_id) FROM dbo." + table + " WHERE " + column + "=?",
                String.class, id));
    }

    /** Two approved recipients, UNLOCKED vault, OPEN session, both accounts linked. No attendance has been recorded. */
    static Two two() {
        var f = fixture(true);
        var legal = f.legal();
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(), legal,
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT, "SQL fixture"));
        long benA = beneficiary(f.vaultId(), "Recipient A");
        long benB = beneficiary(f.vaultId(), "Recipient B");
        long assetA = asset(f.vaultId(), "Asset A");
        long assetB = asset(f.vaultId(), "Asset B");
        var metadata = new BasisIntakeMetadata("COURT_JUDGMENT", "Court fixture", "Document fixture", LocalDate.of(2026, 1, 1),
                "Notary fixture", "Notarial fixture", LocalDate.of(2026, 1, 1), "Receipt fixture", null,
                List.of(new AllocationInput(publicId("assets", "asset_id", assetA), publicId("beneficiaries", "beneficiary_id", benA), "A"),
                        new AllocationInput(publicId("assets", "asset_id", assetB), publicId("beneficiaries", "beneficiary_id", benB), "B")));
        var file = new MockMultipartFile("file", "fixture.pdf", "application/pdf",
                "%PDF-1.4\nFixture only\n%%EOF".getBytes(StandardCharsets.UTF_8));
        context.getBean(BasisIntakeService.class).intake(f.publicCaseId(), legal, metadata, file);
        context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 1, legal);
        context.getBean(CourtDecisionService.class).record(f.publicCaseId(), legal,
                new CourtDecisionRequest(1, CourtDecisionRequest.Result.VALID, "SQL fixture"));
        var review = context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(), f.userId(), "SQL fixture");
        context.getBean(LegalApprovalService.class).decide(f.publicCaseId(), legal,
                new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, review.currentVersionNo(),
                        review.currentSha256Hash(), review.currentAllocationHash(), "SQL fixture"));
        jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status='VERIFIED_AT_COUNTER' WHERE vault_id=?", f.vaultId());
        jdbc.update("UPDATE dbo.vaults SET status='UNLOCKED' WHERE vault_id=?", f.vaultId());
        UUID session = context.getBean(HandoverSessionService.class).open(f.publicCaseId(), legal).sessionId();
        UUID recA = publicId("beneficiaries", "beneficiary_id", benA), recB = publicId("beneficiaries", "beneficiary_id", benB);
        ensureLinkedAccount(new Ready(f, session, recA, publicId("assets", "asset_id", assetA)));
        ensureLinkedAccount(new Ready(f, session, recB, publicId("assets", "asset_id", assetB)));
        User staff = user("STAFF_EXECUTOR", f.userId(), legal.publicId(), legal.email());
        return new Two(f, session, recA, recB, publicId("assets", "asset_id", assetA), publicId("assets", "asset_id", assetB), benA, benB, staff);
    }

    /** Token of the account linked to the given recipient. */
    static User beneficiaryUser(long beneficiaryId) {
        long accountId = jdbc.queryForObject("SELECT linked_user_id FROM dbo.beneficiaries WHERE beneficiary_id=?", Long.class, beneficiaryId);
        UUID publicId = publicId("users", "user_id", accountId);
        String email = jdbc.queryForObject("SELECT email FROM dbo.users WHERE user_id=?", String.class, accountId);
        return user("BENEFICIARY", accountId, publicId, email);
    }

    // ---- real HTTP ------------------------------------------------------------------------------------------------

    static HttpResponse<String> http(String method, String path, Object body, String token, UUID key) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:"
                + context.getEnvironment().getProperty("local.server.port") + "/api/v1" + path));
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (key != null) request.header("Idempotency-Key", key.toString());
        if (body == null) request.method(method, HttpRequest.BodyPublishers.noBody());
        else request.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    static JsonNode json(HttpResponse<String> response, int status) throws Exception {
        assertEquals(status, response.statusCode(), response.body());
        return JSON.readTree(response.body());
    }

    static void expect(HttpResponse<String> response, int status, String code) throws Exception {
        assertEquals(status, response.statusCode(), response.body());
        if (code != null) assertEquals(code, JSON.readTree(response.body()).get("code").asText(), response.body());
    }

    static String staffBase(Two t) { return "/staff/verification-cases/" + t.caseId() + "/handover-sessions/" + t.sessionId(); }

    static String legalBase(Two t) { return "/legal-verifications/verification-cases/" + t.caseId() + "/handover-sessions/" + t.sessionId(); }

    static Map<String, Object> report(long expectedRevision, Set<UUID> present, String reason) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("expectedRevision", expectedRevision);
        body.put("presentRecipientIds", present);
        body.put("reason", reason);
        return body;
    }

    static long revision(Two t) throws Exception {
        return json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200).get("state").get("revision").asLong();
    }

    static JsonNode attendance(Two t, Set<UUID> present) throws Exception {
        return json(http("POST", staffBase(t) + "/group-handover/attendance", report(revision(t), present, "Counter report"),
                t.staff().token(), UUID.randomUUID()), 200);
    }

    static JsonNode reopenRequest(Two t) throws Exception {
        return json(http("POST", staffBase(t) + "/group-handover/reopen-requests",
                report(revision(t), null, "Everyone is now present"), t.staff().token(), UUID.randomUUID()), 200);
    }

    static HttpResponse<String> decide(Two t, User legal, UUID requestId, String decision, long expectedRevision) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("expectedRevision", expectedRevision);
        body.put("decision", decision);
        body.put("reason", "Reviewed the counter report");
        return http("POST", legalBase(t) + "/group-handover/reopen-requests/" + requestId + "/decision", body, legal.token(), UUID.randomUUID());
    }

    static HttpResponse<String> deliver(Two t, UUID recipient, UUID asset) throws Exception {
        return http("POST", staffBase(t) + "/deliveries", Map.of("recipientId", recipient, "assetIds", List.of(asset)),
                t.staff().token(), null);
    }

    static Set<UUID> both(Two t) { return Set.of(t.recA(), t.recB()); }
}
