package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.dto.AllocationInput;
import com.legacyvault.verification.dto.BasisIntakeMetadata;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.ActionBody;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.View;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.service.DistributionWorkflowService;
import com.legacyvault.verification.service.CourtDecisionService;

/**
 * Distribution workflow on real SQL Server (PR #226 contract): request -> upload/forward -> document assessment ->
 * allocation -> allocation review -> final approval -> separate unlock. Each step is its own transaction, exactly as the
 * HTTP layer drives it; the upload and the allocation are different operations.
 */
class DistributionWorkflowSqlServerTest extends LegalBasisSqlServerSupport {

    private static final String LEGAL = DistributionWorkflowService.LEGAL;
    private static final String STAFF = DistributionWorkflowService.STAFF;

    private DistributionWorkflowService workflow() {
        return context.getBean(DistributionWorkflowService.class);
    }

    private View view(Fixture f, String workspace) {
        return workflow().view(f.publicCaseId(), workspace, f.legal());
    }

    private ActionBody body(View v, String reason) {
        return new ActionBody(v.revision(), reason, v.document() == null ? null : v.document().version(),
                v.document() == null ? null : v.document().sha256(), null, null, null);
    }

    private ActionBody allocationBody(View v, String reason) {
        return new ActionBody(v.revision(), reason, v.document().version(), v.document().sha256(),
                v.allocation().version(), v.allocation().sha256(), null);
    }

    private void act(Fixture f, String workspace, String action, ActionBody body) {
        workflow().perform(f.publicCaseId(), workspace, action, body, f.legal());
    }

    private ErrorCode codeOf(Runnable action) {
        return assertThrows(BusinessException.class, action::run).getErrorCode();
    }

    private BasisIntakeMetadata notarialMetadata(List<AllocationInput> allocations) {
        return new BasisIntakeMetadata("NOTARIAL_PARTITION", "Notary Office 1", "045/2026", LocalDate.of(2026, 1, 1),
                "Notary Office 1", "045/2026", LocalDate.of(2026, 1, 1), "Receipt", null, allocations);
    }

    private BasisIntakeMetadata courtMetadata() {
        return new BasisIntakeMetadata("COURT_JUDGMENT", "People's Court", "12/2026", LocalDate.of(2026, 1, 1),
                null, null, null, "Receipt", null, List.of());
    }

    private MockMultipartFile pdf() {
        return new MockMultipartFile("file", "deed.pdf", "application/pdf",
                "%PDF-1.4\nSynthetic deed\n%%EOF".getBytes(StandardCharsets.UTF_8));
    }

    private void upload(Fixture f) {
        workflow().receive(f.publicCaseId(), f.legal(), notarialMetadata(List.of()), pdf());
    }

    private UUID asset(long vaultId, String title) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT dbo.assets (public_id, vault_id, asset_type, title) VALUES (?, ?, 'TEXT', ?)", id.toString(), vaultId, title);
        return id;
    }

    private UUID recipient(long vaultId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT dbo.beneficiaries (public_id, vault_id, full_name) VALUES (?, ?, ?)", id.toString(), vaultId, name);
        return id;
    }

    private int allocationRows(Fixture f, String status) {
        return count("legal_basis_version_allocations", "status=? AND dossier_version_id IN (SELECT v.dossier_version_id "
                + "FROM dbo.legal_basis_dossier_versions v JOIN dbo.legal_basis_dossiers d ON d.legal_basis_dossier_id=v.legal_basis_dossier_id "
                + "WHERE d.verification_case_id=?)", status, f.caseId());
    }

    private String vaultStatus(Fixture f) {
        return jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?", String.class, f.vaultId());
    }

    private ActionBody submit(View v, UUID asset, UUID recipient, String description) {
        return new ActionBody(v.revision(), null, v.document().version(), v.document().sha256(), null, null,
                List.of(new AllocationInput(asset, recipient, description)));
    }

    @Test
    void fullNotarialFlow_eachStepIsSeparate_andTheLastGatesAreEnforced() {
        var f = fixture(true);
        var v = view(f, LEGAL);
        assertEquals("DOCUMENT_REQUEST_NEEDED", v.phase());
        assertTrue(v.prerequisites().deathApproved() && v.prerequisites().willMatched());
        assertNull(v.request());
        assertTrue(v.capabilities().get("requestDocuments").allowed());
        assertFalse(v.capabilities().get("approveDocuments").allowed());
        final var first = v;

        // Nothing but the Legal request opens the upload.
        assertEquals(ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP, codeOf(() -> upload(f)));
        assertEquals(ErrorCode.DISTRIBUTION_WORKFLOW_STALE, codeOf(() -> act(f, LEGAL, "requestDocuments",
                new ActionBody(first.revision() + 1, "Bring the deed", null, null, null, null, null))));
        assertEquals(ErrorCode.VALIDATION_FAILED, codeOf(() -> act(f, LEGAL, "requestDocuments", body(first, "   "))));
        assertEquals(ErrorCode.VALIDATION_FAILED, codeOf(() -> act(f, LEGAL, "requestDocuments", body(first, "x".repeat(1001)))));
        act(f, LEGAL, "requestDocuments", body(v, "Bring the notarial partition deed"));
        v = view(f, STAFF);
        assertEquals("AWAITING_DOCUMENTS", v.phase());
        assertEquals("Bring the notarial partition deed", v.request().reason());
        assertTrue(v.capabilities().get("uploadDocuments").allowed());

        // The upload carries no allocation and decides nothing.
        var stale = v;
        assertEquals(ErrorCode.VALIDATION_FAILED, codeOf(() -> workflow().receive(f.publicCaseId(), f.legal(),
                notarialMetadata(List.of(new AllocationInput(UUID.randomUUID(), UUID.randomUUID(), "hidden"))), pdf())));
        assertEquals(0, count("legal_basis_dossiers", "verification_case_id=?", f.caseId()));
        upload(f);
        assertEquals(0, allocationRows(f, "DRAFT"));
        assertEquals("WILL_VERIFICATION", vaultStatus(f), "receiving a document never moves the vault");
        v = view(f, STAFF);
        assertEquals("AWAITING_DOCUMENTS", v.phase());
        assertEquals(1, v.document().version(), "Staff see the version they just stored");
        assertEquals("PENDING", v.document().status());
        assertTrue(v.capabilities().get("forwardDocuments").allowed());
        assertNull(view(f, LEGAL).document(), "Legal only see a version Staff already forwarded");

        // Forward exactly the stored version.
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, codeOf(() -> workflow().forward(f.publicCaseId(), 2, f.legal())));
        workflow().forward(f.publicCaseId(), 1, f.legal());
        assertEquals("LEGAL_BASIS_VERIFICATION", vaultStatus(f));
        assertEquals(ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP, codeOf(() -> workflow().forward(f.publicCaseId(), 1, f.legal())));
        v = view(f, LEGAL);
        assertEquals("DOCUMENTS_UNDER_REVIEW", v.phase());
        assertEquals("PENDING", v.document().status());
        assertTrue(v.revision() > stale.revision());

        // A stale snapshot, the wrong workspace and a later step are all refused.
        var docs = v;
        assertEquals(ErrorCode.DISTRIBUTION_WORKFLOW_STALE, codeOf(() -> act(f, LEGAL, "approveDocuments",
                new ActionBody(docs.revision(), "ok", 1, "c".repeat(64), null, null, null))));
        assertEquals(ErrorCode.VALIDATION_FAILED, codeOf(() -> act(f, STAFF, "approveDocuments", body(docs, "ok"))));
        assertEquals(ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP, codeOf(() -> act(f, STAFF, "submitAllocations",
                submit(docs, UUID.randomUUID(), UUID.randomUUID(), "early"))));
        assertEquals(ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP, codeOf(() -> workflow().unlock(f.publicCaseId(), f.legal())));
        assertEquals(ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP, codeOf(() -> workflow().decide(f.publicCaseId(), f.legal(),
                new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, 1, docs.document().sha256(), "b".repeat(64), "early"))));

        // Approving the document is not an allocation and not the final approval.
        act(f, LEGAL, "approveDocuments", body(v, "Deed is valid"));
        v = view(f, STAFF);
        assertEquals("AWAITING_ALLOCATIONS", v.phase());
        assertEquals("APPROVED", v.document().status());
        assertNull(v.allocation());
        assertEquals(0, allocationRows(f, "DRAFT") + allocationRows(f, "APPROVED"));
        assertFalse(workflow().legalContext(f.legal(), f.publicCaseId()).capabilities().approval().allowed());

        // Staff submits the allocation; Legal asks for a correction; Staff corrects; the old rows are history.
        UUID asset = asset(f.vaultId(), "Savings"), recipient = recipient(f.vaultId(), "Recipient A");
        assertEquals(ErrorCode.VALIDATION_FAILED, codeOf(() -> act(f, STAFF, "submitAllocations",
                new ActionBody(view(f, STAFF).revision(), null, 1, view(f, STAFF).document().sha256(), null, null, List.of()))));
        assertEquals(ErrorCode.VALIDATION_FAILED, codeOf(() -> act(f, STAFF, "submitAllocations",
                submit(view(f, STAFF), UUID.randomUUID(), recipient, "unknown asset"))));
        act(f, STAFF, "submitAllocations", submit(view(f, STAFF), asset, recipient, "All of it"));
        v = view(f, LEGAL);
        assertEquals("ALLOCATIONS_UNDER_REVIEW", v.phase());
        assertEquals("SUBMITTED", v.allocation().status());
        assertEquals(1, v.allocation().items().size());
        assertEquals(1, v.allocation().version());
        assertEquals(1, allocationRows(f, "DRAFT"));

        act(f, LEGAL, "requestAllocationChanges", allocationBody(v, "Share is wrong"));
        v = view(f, STAFF);
        assertEquals("AWAITING_ALLOCATIONS", v.phase());
        assertEquals("CHANGES_REQUESTED", v.allocation().status());
        assertEquals("Share is wrong", v.feedback());
        act(f, STAFF, "submitAllocations", submit(v, asset, recipient, "Half of it"));
        assertEquals(1, allocationRows(f, "DRAFT"));
        assertEquals(1, allocationRows(f, "SUPERSEDED"));
        v = view(f, LEGAL);
        assertEquals(2, v.allocation().version());
        assertEquals("Half of it", v.allocation().items().get(0).description());

        // Only the exact current allocation can be accepted; accepting it is not the final approval.
        var current = v;
        assertEquals(ErrorCode.DISTRIBUTION_WORKFLOW_STALE, codeOf(() -> act(f, LEGAL, "approveAllocations",
                new ActionBody(current.revision(), "ok", current.document().version(), current.document().sha256(), 1, "d".repeat(64), null))));
        act(f, LEGAL, "approveAllocations", allocationBody(v, "Allocation matches the deed"));
        v = view(f, LEGAL);
        assertEquals("FINAL_APPROVAL", v.phase());
        assertEquals(ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP, codeOf(() -> workflow().unlock(f.publicCaseId(), f.legal())));
        assertEquals("LEGAL_BASIS_VERIFICATION", vaultStatus(f));

        // Final review, final approval, then the separate unlock.
        // Accepting the allocation reviewed the exact snapshot: no separate "complete review" call is needed any more.
        var legalContext = workflow().legalContext(f.legal(), f.publicCaseId());
        assertTrue(legalContext.snapshot().reviewFresh());
        assertTrue(legalContext.capabilities().approval().allowed());
        assertFalse(legalContext.capabilities().unlock().allowed());
        var s = legalContext.snapshot();
        workflow().decide(f.publicCaseId(), f.legal(), new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE,
                s.currentVersion(), s.sha256Hash(), s.allocationHash(), "Everything checked"));
        assertEquals("LEGAL_BASIS_VERIFICATION", vaultStatus(f), "approval does not unlock");
        assertEquals("APPROVED", view(f, LEGAL).phase());
        assertTrue(workflow().legalContext(f.legal(), f.publicCaseId()).capabilities().unlock().allowed());
        workflow().unlock(f.publicCaseId(), f.legal());
        assertEquals("UNLOCKED", vaultStatus(f));
        assertEquals("UNLOCKED", view(f, LEGAL).phase());
        assertEquals(1, count("audit_logs", "action='LEGAL_VAULT_UNLOCKED' AND vault_id=?", f.vaultId()));
        assertThrows(BusinessException.class, () -> workflow().unlock(f.publicCaseId(), f.legal()));
        assertEquals(6, count("distribution_workflow_events", "verification_case_id=?", f.caseId()),
                "request, document approval, two submissions, one change request, allocation approval");
    }

    @Test
    void supplementationReturnsTheCaseToStaff_andAnOldSnapshotCannotBeApproved() {
        var f = fixture(true);
        act(f, LEGAL, "requestDocuments", body(view(f, LEGAL), "Bring the deed"));
        upload(f);
        workflow().forward(f.publicCaseId(), 1, f.legal());
        var first = view(f, LEGAL);
        assertEquals(ErrorCode.VALIDATION_FAILED, codeOf(() -> act(f, LEGAL, "requestDocumentSupplementation", body(first, " "))));
        act(f, LEGAL, "requestDocumentSupplementation", body(first, "The notary stamp is missing"));

        var returned = view(f, STAFF);
        assertEquals("AWAITING_DOCUMENTS", returned.phase());
        assertEquals("CHANGES_REQUESTED", returned.document().status());
        assertEquals("The notary stamp is missing", returned.feedback());
        assertEquals("AWAITING_LEGAL_BASIS", vaultStatus(f));
        assertEquals("LEGAL_BASIS_PROVIDED", jdbc.queryForObject("SELECT status FROM dbo.legal_basis_dossiers WHERE verification_case_id=?", String.class, f.caseId()));

        upload(f);
        workflow().forward(f.publicCaseId(), 2, f.legal());
        var second = view(f, LEGAL);
        assertEquals("DOCUMENTS_UNDER_REVIEW", second.phase());
        assertEquals(2, second.document().version());
        assertEquals("PENDING", second.document().status());
        // The decision the caller looked at was about version 1.
        assertEquals(ErrorCode.DISTRIBUTION_WORKFLOW_STALE, codeOf(() -> act(f, LEGAL, "approveDocuments",
                new ActionBody(second.revision(), "ok", first.document().version(), first.document().sha256(), null, null, null))));
        assertEquals(1, count("distribution_workflow_events", "verification_case_id=? AND action='REQUEST_DOCUMENT_SUPPLEMENTATION'", f.caseId()));
    }

    @Test
    void prerequisitesAndRolesAreEnforcedOnTheServer() {
        var noWill = fixture(false);
        var pending = view(noWill, LEGAL);
        assertEquals("PREREQUISITES_PENDING", pending.phase());
        assertFalse(pending.prerequisites().willMatched());
        assertEquals("DISTRIBUTION_PREREQUISITES_PENDING", pending.capabilities().get("requestDocuments").blockedReason());
        assertEquals(ErrorCode.DISTRIBUTION_PREREQUISITES_PENDING, codeOf(() -> act(noWill, LEGAL, "requestDocuments", body(pending, "Too early"))));

        var f = fixture(true);
        var other = fixture(true);
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, codeOf(() -> workflow().view(f.publicCaseId(), STAFF, other.legal())));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, codeOf(() -> workflow().receive(f.publicCaseId(), other.legal(), notarialMetadata(List.of()), pdf())));
        assertEquals(ErrorCode.VALIDATION_FAILED, codeOf(() -> act(f, STAFF, "requestDocuments", body(view(f, STAFF), "Staff cannot ask"))));
        var staffView = view(f, STAFF);
        assertFalse(staffView.capabilities().get("requestDocuments").allowed(), "Legal's step is not offered to Staff");
        assertEquals(0, count("distribution_workflow_events", "verification_case_id=?", f.caseId()));
    }

    @Test
    void twoActionsOnTheSameRevision_leaveExactlyOneEvent() throws Exception {
        var f = fixture(true);
        var v = view(f, LEGAL);
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<ErrorCode>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    try {
                        act(f, LEGAL, "requestDocuments", body(v, "Bring the deed"));
                        return null;
                    } catch (BusinessException ex) {
                        return ex.getErrorCode();
                    }
                }));
            }
            start.countDown();
            List<ErrorCode> outcomes = new ArrayList<>();
            for (var result : results) outcomes.add(result.get());
            assertEquals(1, outcomes.stream().filter(java.util.Objects::isNull).count());
            assertEquals(1, outcomes.stream().filter(code -> code == ErrorCode.DISTRIBUTION_WORKFLOW_STALE
                    || code == ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP).count());
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1, count("distribution_workflow_events", "verification_case_id=?", f.caseId()));
    }

    @Test
    void courtFlow_acceptingTheDocumentRecordsTheAssessment_soNoSeparateCourtOrReviewStepIsNeeded() {
        var f = fixture(true);
        act(f, LEGAL, "requestDocuments", body(view(f, LEGAL), "Bring the court judgment"));
        workflow().receive(f.publicCaseId(), f.legal(), courtMetadata(), pdf());
        workflow().forward(f.publicCaseId(), 1, f.legal());
        var v = view(f, LEGAL);
        assertEquals("DOCUMENTS_UNDER_REVIEW", v.phase());
        assertTrue(v.capabilities().get("approveDocuments").allowed(), "the stored court file is reviewable");
        assertEquals(0, context.getBean(CourtDecisionService.class).history(f.publicCaseId()).size(), "upload is not an assessment");

        act(f, LEGAL, "approveDocuments", body(v, "The judgment is valid"));
        var decisions = context.getBean(CourtDecisionService.class).history(f.publicCaseId());
        assertEquals(1, decisions.size());
        assertEquals("VALID", decisions.get(0).result());
        assertEquals(1, decisions.get(0).version());

        UUID asset = asset(f.vaultId(), "House"), recipient = recipient(f.vaultId(), "Recipient C");
        act(f, STAFF, "submitAllocations", submit(view(f, STAFF), asset, recipient, "All of it"));
        var legalContext = workflow().legalContext(f.legal(), f.publicCaseId());
        assertFalse(legalContext.capabilities().approval().allowed(), "the allocation is not accepted yet");
        act(f, LEGAL, "approveAllocations", allocationBody(view(f, LEGAL), "Allocation matches the judgment"));

        legalContext = workflow().legalContext(f.legal(), f.publicCaseId());
        assertEquals("VALID", legalContext.snapshot().courtResult());
        assertTrue(legalContext.snapshot().reviewFresh());
        assertTrue(legalContext.capabilities().approval().allowed());
        assertFalse(legalContext.capabilities().unlock().allowed());

        // A dispute that appeared after the review still blocks the final decision.
        var s = legalContext.snapshot();
        var decision = new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, s.currentVersion(), s.sha256Hash(), s.allocationHash(), "Checked");
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET dispute_status='UNDETERMINED' WHERE verification_case_id=?", f.caseId());
        assertEquals(ErrorCode.LEGAL_DECISION_STALE, codeOf(() -> workflow().decide(f.publicCaseId(), f.legal(), decision)));
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET dispute_status='DISPUTED' WHERE verification_case_id=?", f.caseId());

        workflow().decide(f.publicCaseId(), f.legal(), decision);
        assertEquals("LEGAL_BASIS_VERIFICATION", vaultStatus(f), "APPROVE does not unlock");
        workflow().unlock(f.publicCaseId(), f.legal());
        assertEquals("UNLOCKED", vaultStatus(f));
    }

    @Test
    void uploadReturnsTheStoredVersion_andAFailedForwardLeavesItReadyToForwardWithoutUploadingAgain() {
        var f = fixture(true);
        act(f, LEGAL, "requestDocuments", body(view(f, LEGAL), "Bring the deed"));

        var saved = workflow().receive(f.publicCaseId(), f.legal(), notarialMetadata(List.of()), pdf());
        assertEquals(f.publicCaseId(), saved.caseId());
        assertEquals(1, saved.versions().size());
        assertEquals(1, saved.versions().get(0).version());
        assertEquals("NOT_FORWARDED", saved.versions().get(0).forwardStatus());
        assertEquals("LEGAL_BASIS_PROVIDED", saved.status());

        // A forward that fails (wrong version) changes nothing and loses nothing.
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, codeOf(() -> workflow().forward(f.publicCaseId(), 2, f.legal())));
        assertEquals(1, count("legal_basis_dossier_versions", "forward_status='NOT_FORWARDED' AND legal_basis_dossier_id IN "
                + "(SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?)", f.caseId()));
        assertTrue(view(f, STAFF).capabilities().get("forwardDocuments").allowed());

        // The retry forwards the very version that was stored; no second upload happened.
        var forwarded = workflow().forward(f.publicCaseId(), saved.versions().get(0).version(), f.legal());
        assertEquals("LEGAL_BASIS_FORWARDED", forwarded.status());
        assertEquals("FORWARDED", forwarded.versions().get(0).forwardStatus());
        assertEquals(1, forwarded.versions().size());
        assertEquals("LEGAL_BASIS_VERIFICATION", vaultStatus(f));
    }

    /** The same two HTTP calls the Staff screen makes: multipart upload, then forward of the version the upload returned. */
    @Test
    void overHttp_theUploadResponseCarriesTheStoredVersion_andForwardingItSucceeds() throws Exception {
        var f = fixture(true);
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles "
                + "WHERE role_code IN ('ROLE_LEGAL_VERIFIER','ROLE_STAFF_EXECUTOR')", f.userId());
        String token = context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(), f.legal().email(),
                List.of("ROLE_LEGAL_VERIFIER", "ROLE_STAFF_EXECUTOR"));
        var json = new ObjectMapper();
        String base = "http://localhost:" + context.getEnvironment().getProperty("local.server.port") + "/api/v1";
        String staffCase = base + "/staff/verification-cases/" + f.publicCaseId();

        var asked = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(
                        base + "/legal-verifications/verification-cases/" + f.publicCaseId() + "/distribution-workflow/request-documents"))
                .header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"revision\":0,\"reason\":\"Bring the deed\"}")).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, asked.statusCode(), asked.body());

        // allocations is [] exactly as the FE sends it.
        String metadata = "{\"legalBasisType\":\"NOTARIAL_PARTITION\",\"issuingAuthority\":\"Notary Office 1\",\"documentNumber\":\"045/2026\","
                + "\"issueDate\":\"2026-01-01\",\"notaryAuthority\":\"Notary Office 1\",\"notarialDocumentNumber\":\"045/2026\","
                + "\"notarizedAt\":\"2026-01-01\",\"evidenceReference\":null,\"notes\":null,\"allocations\":[]}";
        String boundary = "----lv" + UUID.randomUUID();
        byte[] body = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n" + metadata
                + "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"deed.pdf\"\r\nContent-Type: application/pdf\r\n\r\n"
                + "%PDF-1.4\nSynthetic deed\n%%EOF\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
        var upload = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(staffCase + "/basis-dossier/versions"))
                .header("Authorization", "Bearer " + token).header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(201, upload.statusCode(), upload.body());
        JsonNode stored = json.readTree(upload.body());
        assertEquals(f.publicCaseId().toString(), stored.get("caseId").asText());
        int version = 0;
        for (JsonNode item : stored.get("versions")) version = Math.max(version, item.get("version").asInt());
        assertEquals(1, version);

        // The Staff screen reloads the workflow before forwarding and requires document.version === the uploaded version.
        var reloaded = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(staffCase + "/distribution-workflow"))
                .header("Authorization", "Bearer " + token).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, reloaded.statusCode(), reloaded.body());
        JsonNode workflowAfterUpload = json.readTree(reloaded.body());
        assertEquals("AWAITING_DOCUMENTS", workflowAfterUpload.get("phase").asText());
        assertEquals(version, workflowAfterUpload.get("document").get("version").asInt());
        assertTrue(workflowAfterUpload.get("capabilities").get("forwardDocuments").get("allowed").asBoolean());

        var forward = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(staffCase + "/basis-dossier/versions/" + version + "/forward"))
                .header("Authorization", "Bearer " + token).POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, forward.statusCode(), forward.body());
        JsonNode forwarded = json.readTree(forward.body());
        assertEquals(f.publicCaseId().toString(), forwarded.get("caseId").asText());
        assertEquals("LEGAL_BASIS_FORWARDED", forwarded.get("status").asText());
        assertEquals("FORWARDED", forwarded.get("versions").get(0).get("forwardStatus").asText());
    }

    /** Request, upload, forward and accept the NOTARIAL deed, then submit an allocation: Legal now reviews the allocation. */
    private Fixture toAllocationReview() {
        var f = fixture(true);
        act(f, LEGAL, "requestDocuments", body(view(f, LEGAL), "Bring the deed"));
        upload(f);
        workflow().forward(f.publicCaseId(), 1, f.legal());
        act(f, LEGAL, "approveDocuments", body(view(f, LEGAL), "Deed is valid"));
        act(f, STAFF, "submitAllocations", submit(view(f, STAFF), asset(f.vaultId(), "Savings"), recipient(f.vaultId(), "Recipient A"), "All of it"));
        return f;
    }

    @Test
    void aFailedAllocationAcceptanceLeavesNoReviewBehind_andSuccessRecordsExactlyOne() {
        var f = toAllocationReview();
        var v = view(f, LEGAL);
        assertEquals("ALLOCATIONS_UNDER_REVIEW", v.phase());

        // Stale allocation snapshot: refused before anything is written.
        assertEquals(ErrorCode.DISTRIBUTION_WORKFLOW_STALE, codeOf(() -> act(f, LEGAL, "approveAllocations",
                new ActionBody(v.revision(), "ok", v.document().version(), v.document().sha256(), v.allocation().version(), "e".repeat(64), null))));
        assertEquals(ErrorCode.VALIDATION_FAILED, codeOf(() -> act(f, LEGAL, "approveAllocations", allocationBody(v, " "))));
        assertEquals(0, count("audit_logs", "action='LEGAL_BASIS_REVIEW_RECORDED' AND vault_id=?", f.vaultId()));
        assertEquals(0, count("distribution_workflow_events", "verification_case_id=? AND action='APPROVE_ALLOCATIONS'", f.caseId()));
        assertFalse(workflow().legalContext(f.legal(), f.publicCaseId()).snapshot().reviewFresh());

        act(f, LEGAL, "approveAllocations", allocationBody(v, "Allocation matches the deed"));
        assertEquals(1, count("audit_logs", "action='LEGAL_BASIS_REVIEW_RECORDED' AND vault_id=?", f.vaultId()));
        assertEquals(1, count("distribution_workflow_events", "verification_case_id=? AND action='APPROVE_ALLOCATIONS'", f.caseId()));
        var snapshot = workflow().legalContext(f.legal(), f.publicCaseId()).snapshot();
        assertTrue(snapshot.reviewFresh());
        assertEquals(v.document().sha256(), snapshot.sha256Hash());
        assertEquals(v.allocation().sha256(), snapshot.allocationHash(), "the review covers the exact allocation that was accepted");
    }

    @Test
    void anAllocationChangedAfterAcceptanceCannotBeApprovedOrUnlocked() {
        var f = toAllocationReview();
        act(f, LEGAL, "approveAllocations", allocationBody(view(f, LEGAL), "Allocation matches the deed"));
        var s = workflow().legalContext(f.legal(), f.publicCaseId()).snapshot();
        var decision = new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, s.currentVersion(), s.sha256Hash(), s.allocationHash(), "Checked");

        jdbc.update("UPDATE dbo.legal_basis_version_allocations SET allocation_description='Changed behind the back' WHERE status<>'SUPERSEDED' AND dossier_version_id IN "
                + "(SELECT v.dossier_version_id FROM dbo.legal_basis_dossier_versions v JOIN dbo.legal_basis_dossiers d ON d.legal_basis_dossier_id=v.legal_basis_dossier_id WHERE d.verification_case_id=?)", f.caseId());

        var after = view(f, LEGAL);
        assertEquals("AWAITING_ALLOCATIONS", after.phase(), "rows that no longer match what Legal accepted must be submitted again");
        assertEquals("CHANGES_REQUESTED", after.allocation().status());
        assertEquals(ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP, codeOf(() -> workflow().decide(f.publicCaseId(), f.legal(), decision)));
        assertEquals(ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP, codeOf(() -> workflow().unlock(f.publicCaseId(), f.legal())));
        assertEquals("LEGAL_BASIS_VERIFICATION", vaultStatus(f));
        assertEquals(0, count("audit_logs", "action='LEGAL_VAULT_UNLOCKED' AND vault_id=?", f.vaultId()));
    }

    @Test
    void aCourtAssessmentBelongsToOneVersion_andASupplementedVersionStartsWithoutOne() {
        var f = fixture(true);
        act(f, LEGAL, "requestDocuments", body(view(f, LEGAL), "Bring the court judgment"));
        workflow().receive(f.publicCaseId(), f.legal(), courtMetadata(), pdf());
        workflow().forward(f.publicCaseId(), 1, f.legal());
        act(f, LEGAL, "requestDocumentSupplementation", body(view(f, LEGAL), "The seal is missing"));
        assertEquals(0, context.getBean(CourtDecisionService.class).history(f.publicCaseId()).size(),
                "asking for more documents records no conclusion");

        workflow().receive(f.publicCaseId(), f.legal(), courtMetadata(), pdf());
        assertEquals(0, context.getBean(CourtDecisionService.class).history(f.publicCaseId()).size(), "upload is not an assessment");
        workflow().forward(f.publicCaseId(), 2, f.legal());
        assertEquals(0, context.getBean(CourtDecisionService.class).history(f.publicCaseId()).size(), "forward is not an assessment");
        var v = view(f, LEGAL);
        assertEquals(2, v.document().version());
        assertEquals("PENDING", v.document().status(), "version 2 does not inherit anything from version 1");

        act(f, LEGAL, "approveDocuments", body(v, "The new judgment is valid"));
        var decisions = context.getBean(CourtDecisionService.class).history(f.publicCaseId());
        assertEquals(1, decisions.size());
        assertEquals(2, decisions.get(0).version());
        assertEquals("VALID", decisions.get(0).result());
    }
}
