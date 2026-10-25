package com.legacyvault.verification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.auth.JwtService;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * BE-01: unlinked account creation, link request by case code, Staff approve/reject, race and failure behaviour.
 * Real HTTP + SQL Server in the disposable DB created by {@link LegalBasisSqlServerSupport}; skipped without
 * LEGAL_SQLSERVER_MASTER_URL like the other SQL Server tests.
 */
class StaffLinkRequestHttpSqlServerTest extends LegalBasisSqlServerSupport {
    private static final String PASSWORD = "Counter-Pass-2026";
    private final ObjectMapper json = new ObjectMapper();

    private HttpResponse<String> send(String method, String path, Object body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:"
                + context.getEnvironment().getProperty("local.server.port") + "/api/v1" + path));
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (body == null) request.method(method, HttpRequest.BodyPublishers.noBody());
        else request.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode call(String method, String path, Object body, String token, int status) throws Exception {
        var response = send(method, path, body, token);
        assertEquals(status, response.statusCode(), method + " " + path + ": " + response.body());
        return json.readTree(response.body());
    }

    private void callExpecting(String method, String path, Object body, String token, int status, String code) throws Exception {
        var response = send(method, path, body, token);
        assertEquals(status, response.statusCode(), method + " " + path + ": " + response.body());
        assertEquals(code, json.readTree(response.body()).get("code").asText());
    }

    private record Counter(Fixture fixture, String staffToken, String caseCode, String casePath) { }

    /** An OPEN case assigned to a Staff Executor, with its Staff token and display code. */
    private Counter counter() {
        var f = fixture(false);
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_STAFF_EXECUTOR'",
                f.userId());
        String staff = context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(), f.legal().email(),
                List.of("ROLE_STAFF_EXECUTOR"));
        int year = jdbc.queryForObject("SELECT YEAR(created_at) FROM dbo.verification_cases WHERE verification_case_id=?",
                Integer.class, f.caseId());
        String code = String.format("HS-%04d-%06d", year, f.caseId());
        return new Counter(f, staff, code, "/staff/verification-cases/" + f.publicCaseId());
    }

    private String verifiedRecipient(Counter c, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT dbo.beneficiaries(public_id,vault_id,full_name,id_verification_status) VALUES (?,?,?,'VERIFIED_AT_COUNTER')",
                id.toString(), c.fixture().vaultId(), name);
        return id.toString();
    }

    private record Person(String email, String token, long userId) { }

    /** Staff creates the account (unlinked) and the person logs in. */
    private Person person(Counter c, String name) throws Exception {
        String email = UUID.randomUUID() + "@example.test";
        call("POST", c.casePath() + "/accounts", Map.of("email", email, "fullName", name, "password", PASSWORD), c.staffToken(), 201);
        String token = call("POST", "/auth/login", Map.of("email", email, "password", PASSWORD), null, 200)
                .get("accessToken").asText();
        long userId = jdbc.queryForObject("SELECT user_id FROM dbo.users WHERE email=?", Long.class, email);
        return new Person(email, token, userId);
    }

    private String submit(Counter c, Person p) throws Exception {
        return call("POST", "/beneficiary-link-requests", Map.of("caseCode", c.caseCode()), p.token(), 201)
                .get("requestId").asText();
    }

    private String requestStatus(String requestId) {
        return jdbc.queryForObject("SELECT status FROM dbo.beneficiary_link_requests WHERE public_id=?", String.class, requestId);
    }

    private Long linkedUser(String recipientId) {
        return jdbc.queryForObject("SELECT linked_user_id FROM dbo.beneficiaries WHERE public_id=?", Long.class, recipientId);
    }

    private int beneficiaryRoles(long userId) {
        return count("user_roles", "user_id=? AND role_id=(SELECT role_id FROM dbo.roles WHERE role_code='ROLE_BENEFICIARY')", userId);
    }

    @Test
    void unlinkedAccount_requestByCode_staffApprove_linksTheStoredRequesterOnly() throws Exception {
        var c = counter();
        String recipient = verifiedRecipient(c, "Recipient One");
        String email = UUID.randomUUID() + "@example.test";

        call("POST", c.casePath() + "/accounts", Map.of("email", email, "fullName", "Person One", "password", PASSWORD),
                c.staffToken(), 201);
        long userId = jdbc.queryForObject("SELECT user_id FROM dbo.users WHERE email=?", Long.class, email);
        assertEquals(0, beneficiaryRoles(userId), "a new account has no Beneficiary role");
        assertEquals(0, count("beneficiaries", "linked_user_id=?", userId), "a new account is not linked");
        callExpecting("POST", c.casePath() + "/accounts", Map.of("email", email, "fullName", "Dup", "password", PASSWORD),
                c.staffToken(), 409, "EMAIL_ALREADY_EXISTS");
        String token = call("POST", "/auth/login", Map.of("email", email, "password", PASSWORD), null, 200)
                .get("accessToken").asText();

        // Submitting only records PENDING: nothing is linked and no role is granted.
        callExpecting("POST", "/beneficiary-link-requests", Map.of("caseCode", "HS-2026-999999"), token, 422,
                "BENEFICIARY_LINK_REQUEST_INVALID");
        var created = call("POST", "/beneficiary-link-requests", Map.of("caseCode", c.caseCode().toLowerCase()), token, 201);
        String requestId = created.get("requestId").asText();
        assertEquals("PENDING", created.get("status").asText());
        assertEquals("PENDING", requestStatus(requestId));
        assertEquals(0, count("beneficiaries", "linked_user_id=?", userId));
        assertEquals(0, beneficiaryRoles(userId));
        callExpecting("POST", "/beneficiary-link-requests", Map.of("caseCode", c.caseCode()), token, 409,
                "BENEFICIARY_LINK_REQUEST_ALREADY_PENDING");
        assertEquals(1, call("GET", "/beneficiary-link-requests", null, token, 200).size());

        var pending = call("GET", c.casePath() + "/link-requests", null, c.staffToken(), 200);
        assertEquals(1, pending.size());
        assertEquals(email, pending.get(0).get("requesterEmail").asText());

        // Hints about another account in the body are ignored: the stored requester is linked.
        var decision = call("POST", c.casePath() + "/link-requests/" + requestId + "/approve",
                Map.of("beneficiaryId", recipient, "accountId", UUID.randomUUID().toString(), "email", "attacker@example.test"),
                c.staffToken(), 200);
        assertEquals("APPROVED", decision.get("status").asText());
        assertEquals("APPROVED", requestStatus(requestId));
        assertEquals(userId, linkedUser(recipient));
        assertEquals("ACCOUNT_CREATED", jdbc.queryForObject("SELECT account_status FROM dbo.beneficiaries WHERE public_id=?",
                String.class, recipient));
        assertEquals(1, beneficiaryRoles(userId));
        assertTrue(count("audit_logs", "action='BENEFICIARY_LINK_REQUEST_APPROVED' AND vault_id=?", c.fixture().vaultId()) >= 1);
        assertTrue(count("audit_logs", "action='BENEFICIARY_ACCOUNT_LINKED' AND vault_id=?", c.fixture().vaultId()) >= 1);
        callExpecting("POST", c.casePath() + "/link-requests/" + requestId + "/approve", Map.of("beneficiaryId", recipient),
                c.staffToken(), 409, "BENEFICIARY_LINK_REQUEST_NOT_PENDING");
    }

    @Test
    void reject_neverLinksOrGrantsAnything_andCancelBelongsToTheOwner() throws Exception {
        var c = counter();
        String recipient = verifiedRecipient(c, "Recipient Two");
        var rejected = person(c, "Rejected Person");
        var other = person(c, "Other Person");

        String requestId = submit(c, rejected);
        callExpecting("POST", "/beneficiary-link-requests/" + requestId + "/cancel", null, other.token(), 404, "RESOURCE_NOT_FOUND");
        assertEquals("PENDING", requestStatus(requestId));

        call("POST", c.casePath() + "/link-requests/" + requestId + "/reject", null, c.staffToken(), 200);
        assertEquals("REJECTED", requestStatus(requestId));
        assertNull(linkedUser(recipient));
        assertEquals(0, beneficiaryRoles(rejected.userId()));
        callExpecting("POST", "/beneficiary-link-requests/" + requestId + "/cancel", null, rejected.token(), 409,
                "BENEFICIARY_LINK_REQUEST_NOT_PENDING");

        String second = submit(c, other);
        call("POST", "/beneficiary-link-requests/" + second + "/cancel", null, other.token(), 200);
        assertEquals("CANCELLED", requestStatus(second));
        // A cancelled request can be sent again.
        assertEquals("PENDING", requestStatus(submit(c, other)));
    }

    @Test
    void authorization_onlyTheAssignedStaffCanSeeOrDecide_andUnverifiedRecipientIsRefused() throws Exception {
        var c = counter();
        var outsider = counter(); // another Staff with their own case
        String recipient = verifiedRecipient(c, "Recipient Three");
        String unverified = UUID.randomUUID().toString();
        jdbc.update("INSERT dbo.beneficiaries(public_id,vault_id,full_name) VALUES (?,?,'Not verified')", unverified, c.fixture().vaultId());
        var p = person(c, "Person Three");
        String requestId = submit(c, p);

        callExpecting("GET", "/staff/verification-cases/" + c.fixture().publicCaseId() + "/link-requests", null, p.token(), 403,
                "ACCESS_DENIED");
        callExpecting("GET", c.casePath() + "/link-requests", null, outsider.staffToken(), 404, "RESOURCE_NOT_FOUND");
        callExpecting("POST", c.casePath() + "/link-requests/" + requestId + "/approve", Map.of("beneficiaryId", recipient),
                outsider.staffToken(), 404, "RESOURCE_NOT_FOUND");
        callExpecting("POST", c.casePath() + "/link-requests/" + requestId + "/approve", Map.of("beneficiaryId", unverified),
                c.staffToken(), 409, "BENEFICIARY_IDENTITY_NOT_VERIFIED");
        assertEquals("PENDING", requestStatus(requestId));
        assertEquals(0, count("beneficiaries", "vault_id=? AND linked_user_id IS NOT NULL", c.fixture().vaultId()));
    }

    @Test
    void twoRequestsRacingForOneRecipient_createExactlyOneLink() throws Exception {
        var c = counter();
        String recipient = verifiedRecipient(c, "Contested Recipient");
        var a = person(c, "Racer A");
        var b = person(c, "Racer B");
        String requestA = submit(c, a);
        String requestB = submit(c, b);

        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Integer>> approvals = new ArrayList<>();
            for (String id : List.of(requestA, requestB)) {
                approvals.add(() -> {
                    start.await();
                    return send("POST", c.casePath() + "/link-requests/" + id + "/approve",
                            Map.of("beneficiaryId", recipient), c.staffToken()).statusCode();
                });
            }
            var futures = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (var task : approvals) futures.add(pool.submit(task));
            start.countDown();
            var statuses = new ArrayList<Integer>();
            for (var future : futures) statuses.add(future.get());
            statuses.sort(Integer::compare);
            assertEquals(List.of(200, 409), statuses);
        } finally {
            pool.shutdownNow();
        }

        assertEquals(1, count("beneficiary_link_requests", "status='APPROVED' AND beneficiary_id=(SELECT beneficiary_id FROM dbo.beneficiaries WHERE public_id=?)", recipient));
        assertEquals(1, count("beneficiary_link_requests", "status='PENDING' AND verification_case_id=?", c.fixture().caseId()));
        Long linked = linkedUser(recipient);
        String winner = requestStatus(requestA).equals("APPROVED") ? "A" : "B";
        assertEquals("A".equals(winner) ? a.userId() : b.userId(), linked);
        assertEquals(1, count("beneficiaries", "vault_id=? AND linked_user_id IS NOT NULL", c.fixture().vaultId()));
    }

    @Test
    void failureWhileGrantingTheRole_leavesRequestPendingAndRecipientUnlinked() throws Exception {
        var c = counter();
        String recipient = verifiedRecipient(c, "Recipient Rollback");
        var p = person(c, "Person Rollback");
        String requestId = submit(c, p);

        // Make the Beneficiary role lookup fail inside the approve transaction, then restore it.
        jdbc.update("UPDATE dbo.roles SET role_code='ROLE_BENEFICIARY_TMP' WHERE role_code='ROLE_BENEFICIARY'");
        try {
            var response = send("POST", c.casePath() + "/link-requests/" + requestId + "/approve",
                    Map.of("beneficiaryId", recipient), c.staffToken());
            assertEquals(500, response.statusCode(), response.body());
        } finally {
            jdbc.update("UPDATE dbo.roles SET role_code='ROLE_BENEFICIARY' WHERE role_code='ROLE_BENEFICIARY_TMP'");
        }

        assertEquals("PENDING", requestStatus(requestId));
        assertNull(linkedUser(recipient));
        assertEquals(0, count("audit_logs", "action='BENEFICIARY_LINK_REQUEST_APPROVED' AND entity_id=(SELECT link_request_id FROM dbo.beneficiary_link_requests WHERE public_id=?)", requestId));
        // The same request can still be approved once the cause is gone.
        call("POST", c.casePath() + "/link-requests/" + requestId + "/approve", Map.of("beneficiaryId", recipient),
                c.staffToken(), 200);
        assertEquals(p.userId(), linkedUser(recipient));
    }
}
