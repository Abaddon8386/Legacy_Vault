package com.legacyvault.verification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.auth.JwtService;
import com.legacyvault.beneficiary.BeneficiaryDtos;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.verification.dto.AllocationInput;
import com.legacyvault.verification.dto.BasisIntakeMetadata;
import com.legacyvault.verification.service.BasisForwardService;
import com.legacyvault.verification.service.BasisIntakeService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * BE-02 (ST-18, ST-20–29, LV-BASIS-001, LV-HANDOVER-001, AC-L06/L07/L08): the Court document splits the estate between
 * A (already an Owner designated beneficiary) and C (named only by the court). B is on the Owner list but not in the
 * document. Real HTTP + SQL in a disposable DB; identity attestation is the Staff-recorded synthetic fixture.
 */
class CourtRecipientsHttpSqlServerTest extends LegalBasisSqlServerSupport {
    private final ObjectMapper json = new ObjectMapper();

    private HttpResponse<String> send(String method, String path, Object body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:"
                + context.getEnvironment().getProperty("local.server.port") + "/api/v1" + path));
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (path.endsWith("/confirmation") && "POST".equals(method)) {
            String boundary="SignedReceiptFixture";
            String multipart="--"+boundary+"\r\nContent-Disposition: form-data; name=\"attested\"\r\n\r\ntrue\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"signed-demo.pdf\"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 synthetic signed-receipt fixture\r\n--"+boundary+"--\r\n";
            request.header("Content-Type","multipart/form-data; boundary="+boundary).method(method,HttpRequest.BodyPublishers.ofString(multipart));
        } else if (body == null) request.method(method, HttpRequest.BodyPublishers.noBody());
        else request.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode call(String method, String path, Object body, String token, int status) throws Exception {
        var response = send(method, path, body, token);
        assertEquals(status, response.statusCode(), method + " " + path + ": " + response.body());
        return json.readTree(response.body());
    }

    private void callExpectingCode(String method, String path, Object body, String token, int status, String code)
            throws Exception {
        var response = send(method, path, body, token);
        assertEquals(status, response.statusCode(), method + " " + path + ": " + response.body());
        assertEquals(code, json.readTree(response.body()).get("code").asText());
    }

    private long asset(long vaultId, String title) {
        long id = jdbc.queryForObject("INSERT dbo.assets (public_id, vault_id, asset_type, title) OUTPUT inserted.asset_id "
                + "VALUES (?, ?, 'TEXT', ?)", Long.class, UUID.randomUUID().toString(), vaultId, title);
        var repo = context.getBean(AssetRepository.class);
        tx.execute(status -> {
            var entity = repo.findById(id).orElseThrow();
            entity.setEncryptedPayload(context.getBean(EncryptionService.class)
                    .encrypt("content of " + title, AssetService.associatedData(entity)));
            repo.saveAndFlush(entity);
            return null;
        });
        return id;
    }

    private String publicId(String table, String idColumn, long id) {
        return jdbc.queryForObject("SELECT CAST(public_id AS varchar(36)) FROM dbo." + table + " WHERE " + idColumn + "=?",
                String.class, id).toLowerCase(java.util.Locale.ROOT); // SQL Server renders UUIDs upper-case
    }

    private long beneficiary(long vaultId, String name) {
        return jdbc.queryForObject("INSERT dbo.beneficiaries (public_id, vault_id, full_name) OUTPUT inserted.beneficiary_id "
                + "VALUES (?, ?, ?)", Long.class, UUID.randomUUID().toString(), vaultId, name);
    }

    /** Registers an account and links it to the recipient at the counter (ST-24). Returns the recipient's access token. */
    private String linkAccount(String recipient, String staff, String name) throws Exception {
        String email = UUID.randomUUID() + "@example.test", password = "Synthetic-Court-2026";
        call("POST", "/auth/register", Map.of("fullName", name, "email", email, "password", password), null, 201);
        call("POST", "/staff/beneficiaries/" + recipient + "/account-link", Map.of("accountEmail", email), staff, 200);
        return call("POST", "/auth/login", Map.of("email", email, "password", password), null, 200)
                .get("accessToken").asText();
    }

    @Test
    void courtSplitsEstateBetweenAandC_BhasNoRight_unlinkedCIsBlockedUntilLinked_partialDeliveryShowsOnlyDelivered()
            throws Exception {
        String password = "Synthetic-Court-2026";
        var f = fixture(true);
        jdbc.update("UPDATE dbo.vaults SET status='DOCUMENT_VERIFICATION' WHERE vault_id=?", f.vaultId());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles "
                + "WHERE role_code IN ('ROLE_LEGAL_VERIFIER','ROLE_STAFF_EXECUTOR')", f.userId());
        String staff = context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(), f.legal().email(),
                List.of("ROLE_LEGAL_VERIFIER", "ROLE_STAFF_EXECUTOR"));
        String legal = "/legal-verifications/verification-cases/" + f.publicCaseId();

        // Owner list: A and B. Estate: three assets.
        long a = beneficiary(f.vaultId(), "Recipient A");
        long b = beneficiary(f.vaultId(), "Recipient B (not in the court document)");
        long asset1 = asset(f.vaultId(), "Asset 1");
        long asset2 = asset(f.vaultId(), "Asset 2");
        long asset3 = asset(f.vaultId(), "Asset 3");
        String recipientA = publicId("beneficiaries", "beneficiary_id", a);
        String recipientB = publicId("beneficiaries", "beneficiary_id", b);

        call("POST", legal + "/basis-dossier", Map.of("route", "COURT", "routeReason", "Synthetic court record"), staff, 201);

        // ST-18: the Court document gives asset 1 to A (existing) and assets 2+3 to C (named only by the court).
        var courtC = new BeneficiaryDtos.UpsertRequest("Recipient C", "Cháu nội", LocalDate.of(1990, 5, 1), null, null,
                "079090000001");
        var metadata = new BasisIntakeMetadata("COURT_JUDGMENT", "Court fixture", "Document fixture",
                LocalDate.of(2026, 1, 1), null, null, null, "Receipt fixture", null, List.of(
                new AllocationInput(UUID.fromString(publicId("assets", "asset_id", asset1)), UUID.fromString(recipientA),
                        "asset 1 to A", null),
                new AllocationInput(UUID.fromString(publicId("assets", "asset_id", asset2)), null, "asset 2 to C", courtC),
                new AllocationInput(UUID.fromString(publicId("assets", "asset_id", asset3)), null, "asset 3 to C", courtC)));
        var file = new MockMultipartFile("file", "judgment.pdf", "application/pdf",
                "%PDF-1.4\nSynthetic court judgment\n%%EOF".getBytes(StandardCharsets.UTF_8));
        context.getBean(BasisIntakeService.class).intake(f.publicCaseId(), f.legal(), metadata, file);

        // C exists once, remembers the exact version that named it, and B is untouched.
        assertEquals(1, count("beneficiaries", "vault_id=? AND origin='COURT_DOCUMENT'", f.vaultId()));
        long c = jdbc.queryForObject("SELECT beneficiary_id FROM dbo.beneficiaries WHERE vault_id=? AND origin='COURT_DOCUMENT'",
                Long.class, f.vaultId());
        assertEquals(jdbc.queryForObject("SELECT dossier_version_id FROM dbo.legal_basis_dossier_versions WHERE version_no=1 "
                + "AND legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers "
                + "WHERE verification_case_id=?)", Long.class, f.caseId()),
                jdbc.queryForObject("SELECT origin_dossier_version_id FROM dbo.beneficiaries WHERE beneficiary_id=?",
                        Long.class, c));
        assertEquals("OWNER_DESIGNATED", jdbc.queryForObject("SELECT origin FROM dbo.beneficiaries WHERE beneficiary_id=?",
                String.class, b));
        assertEquals(3, count("legal_basis_version_allocations", "beneficiary_id IN (?,?)", a, c));
        assertEquals(0, count("legal_basis_version_allocations", "beneficiary_id=?", b));
        String recipientC = publicId("beneficiaries", "beneficiary_id", c);

        context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 1, f.legal());

        // Legal sees which lines come from the court document and that C has no account — information, not a blocker.
        var snapshot = call("GET", legal + "/context", null, staff, 200);
        JsonNode lineC = null;
        for (JsonNode lines : snapshot.findValues("allocations"))
            for (JsonNode line : lines)
                if ("COURT_DOCUMENT".equals(line.path("recipientSource").asText())) lineC = line;
        assertTrue(lineC != null, "Legal context must expose the court sourced recipient: " + snapshot);
        assertEquals("Recipient C", lineC.get("recipientName").asText());
        assertEquals(1, lineC.get("sourceVersionNo").asInt());
        assertFalse(lineC.get("accountLinked").asBoolean());

        var state = snapshot.get("snapshot");
        call("POST", legal + "/basis-dossier/court-decisions", Map.of("version", 1, "result", "VALID",
                "reason", "Synthetic court review"), staff, 201);
        completeDistribution(f);
        call("POST", legal + "/basis-dossier/review", Map.of("reason", "Synthetic exact version",
                "versionNo", state.get("currentVersion").asInt(), "sha256Hash", state.get("sha256Hash").asText(),
                "allocationHash", state.get("allocationHash").asText(), "disputeStatus", state.get("disputeStatus").asText()),
                staff, 200);
        call("POST", legal + "/basis-dossier/decision", Map.of("decision", "APPROVE", "versionNo", 1,
                "sha256Hash", state.get("sha256Hash").asText(), "allocationHash", state.get("allocationHash").asText(),
                "reason", "Synthetic final approval"), staff, 200);
        call("POST", legal + "/unlock", null, staff, 200);

        // Counter: A and C are verified in person. Only A has a linked account so far.
        String attest = "/staff/verification-cases/" + f.publicCaseId() + "/beneficiaries/";
        call("POST", attest + recipientA + "/identity-attestations", Map.of("evidenceReference", "SYNTHETIC-A"), staff, 201);
        call("POST", attest + recipientC + "/identity-attestations", Map.of("evidenceReference", "SYNTHETIC-C"), staff, 201);
        String tokenA = linkAccount(recipientA, staff, "Recipient A");

        String sessions = "/staff/verification-cases/" + f.publicCaseId() + "/handover-sessions";
        String root = sessions + "/" + call("POST", sessions, null, staff, 201).get("sessionId").asText();
        String assetId1 = publicId("assets", "asset_id", asset1);
        String assetId2 = publicId("assets", "asset_id", asset2);
        String assetId3 = publicId("assets", "asset_id", asset3);

        // B is on the Owner list but has no right: not in the eligible list and cannot be delivered anything.
        var eligible = call("GET", root + "/eligible-assets", null, staff, 200);
        assertEquals(3, eligible.size());
        for (JsonNode line : eligible) assertTrue(!recipientB.equals(line.get("recipientId").asText()));
        callExpectingCode("POST", root + "/deliveries", Map.of("recipientId", recipientB, "assetIds", List.of(assetId1)),
                staff, 409, "HANDOVER_RECIPIENT_NOT_ELIGIBLE");

        // C has no linked account: the list explains why and a delivery is refused without side effects.
        for (JsonNode line : eligible) {
            if (recipientC.equals(line.get("recipientId").asText())) {
                assertFalse(line.get("deliverable").asBoolean());
                assertEquals("RECIPIENT_ACCOUNT_REQUIRED", line.get("blockedReason").asText());
                assertEquals("COURT_DOCUMENT", line.get("recipientSource").asText());
            } else {
                assertTrue(line.get("deliverable").asBoolean(), "A must be deliverable: " + eligible);
            }
        }
        callExpectingCode("POST", root + "/deliveries", Map.of("recipientId", recipientC, "assetIds", List.of(assetId2)),
                staff, 409, "HANDOVER_RECIPIENT_ACCOUNT_REQUIRED");
        assertEquals(0, count("handover_items", "beneficiary_id=?", c));

        // A, who is eligible, still receives first.
        String itemA = call("POST", root + "/deliveries", Map.of("recipientId", recipientA, "assetIds", List.of(assetId1)),
                staff, 201).get(0).get("itemId").asText();
        callExpectingCode("POST", root + "/deliveries", Map.of("recipientId", recipientA, "assetIds", List.of(assetId1)),
                staff, 409, "HANDOVER_ASSET_ALREADY_DELIVERED");
        assertEquals(1, call("GET", "/received-assets", null, tokenA, 200).get("totalElements").asInt());
        assertEquals("content of Asset 1", call("POST", "/received-assets/" + itemA + "/content",
                Map.of("password", password), tokenA, 200).get("payload").asText());

        // The vault cannot close while C still has undelivered assets.
        call("POST", root + "/close", null, staff, 409);

        // C links an account; deliver only 1 of 2 assets: C sees exactly that one, A cannot read it.
        String tokenC = linkAccount(recipientC, staff, "Recipient C");
        assertEquals(0, call("GET", "/received-assets", null, tokenC, 200).get("totalElements").asInt());
        String itemC2 = call("POST", root + "/deliveries", Map.of("recipientId", recipientC, "assetIds", List.of(assetId2)),
                staff, 201).get(0).get("itemId").asText();
        var receivedC = call("GET", "/received-assets", null, tokenC, 200);
        assertEquals(1, receivedC.get("totalElements").asInt());
        assertEquals(itemC2, receivedC.get("content").get(0).get("itemId").asText());
        assertEquals("content of Asset 2", call("POST", "/received-assets/" + itemC2 + "/content",
                Map.of("password", password), tokenC, 200).get("payload").asText());
        assertEquals(404, send("GET", "/received-assets/" + itemC2, null, tokenA).statusCode());
        assertEquals(404, send("POST", "/received-assets/" + itemC2 + "/content", Map.of("password", password), tokenA)
                .statusCode());

        // Finish: deliver the rest, both recipients confirm (dual gate), close, receipts, archive.
        call("POST", root + "/deliveries", Map.of("recipientId", recipientC, "assetIds", List.of(assetId3)), staff, 201);
        call("POST", root + "/beneficiaries/" + recipientA + "/confirmation", Map.of("receiptReference", "SYNTHETIC-A"),
                staff, 200);
        call("POST", root + "/close", null, staff, 409); // C has not confirmed yet
        call("POST", root + "/beneficiaries/" + recipientC + "/confirmation", Map.of("receiptReference", "SYNTHETIC-C"),
                staff, 200);
        call("POST", root + "/close", null, staff, 200);
        call("POST", root + "/receipts", Map.of("recipientId", recipientA, "assetIds", List.of(assetId1)), staff, 201);
        call("POST", root + "/receipts", Map.of("recipientId", recipientC, "assetIds", List.of(assetId2, assetId3)), staff, 201);
        call("POST", root + "/archive", null, staff, 200);

        // Delivered history is still readable by its own account after archive, and only by it.
        assertEquals(2, call("GET", "/received-assets", null, tokenC, 200).get("totalElements").asInt());
        assertEquals(1, call("GET", "/received-assets", null, tokenA, 200).get("totalElements").asInt());
        assertEquals("content of Asset 2", call("POST", "/received-assets/" + itemC2 + "/content",
                Map.of("password", password), tokenC, 200).get("payload").asText());
    }
}
