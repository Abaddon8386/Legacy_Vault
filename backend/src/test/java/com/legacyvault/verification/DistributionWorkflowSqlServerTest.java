package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.dto.AllocationInput;
import com.legacyvault.verification.dto.BasisIntakeMetadata;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.ActionBody;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.View;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.service.DistributionWorkflowService;
import com.legacyvault.verification.service.LegalBasisReviewService;

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
        assertNull(v.document(), "only a forwarded version is the document under assessment");

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
        var legalContext = workflow().legalContext(f.legal(), f.publicCaseId());
        assertFalse(legalContext.capabilities().approval().allowed(), "a fresh review of the exact snapshot is still needed");
        context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(), f.userId(), "Snapshot checked");
        legalContext = workflow().legalContext(f.legal(), f.publicCaseId());
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
}
