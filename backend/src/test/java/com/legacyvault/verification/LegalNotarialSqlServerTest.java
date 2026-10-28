package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisForwardService;
import com.legacyvault.verification.service.LegalApprovalService;
import com.legacyvault.verification.service.LegalBasisReviewService;
import com.legacyvault.verification.service.LegalReadService;
import com.legacyvault.verification.service.LegalVaultUnlockService;

/**
 * Legacy NOTARIAL dossiers reach Legal only through an already forwarded record (new classify/intake/forward stay
 * COURT-only). Real SQL Server: a COURT fixture is forwarded, then turned into the legacy NOTARIAL shape.
 */
class LegalNotarialSqlServerTest extends LegalBasisSqlServerSupport {

    /** Forwarded dossier in LEGAL_BASIS_VERIFICATION with a MATCH will; converted to NOTARIAL with or without a deed. */
    private Fixture notarial(boolean deed) {
        var f = fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(), f.legal(),
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT, "Notarial fixture"));
        intakeVersion(f, "COURT_JUDGMENT");
        context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 1, f.legal());
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET route='NOTARIAL', dispute_status='NONE' WHERE verification_case_id=?", f.caseId());
        if (deed) {
            jdbc.update("UPDATE dbo.legal_basis_dossier_versions SET legal_basis_type='NOTARIAL_PARTITION', "
                    + "notary_authority='Notary Office 1', notarial_document_number='045/2026', notarized_at='2026-01-01' "
                    + "WHERE legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?)", f.caseId());
        }
        return f;
    }

    private LegalApprovalRequest approve(LegalReadService read, Fixture f, String reason) {
        var s = read.context(f.legal(), f.publicCaseId()).snapshot();
        return new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, s.currentVersion(), s.sha256Hash(), s.allocationHash(), reason);
    }

    @Test
    void notarialWithDeedAndMatchingWill_reviewsApprovesAndUnlocksOnceInOrder() {
        var f = notarial(true);
        var read = context.getBean(LegalReadService.class);

        var before = read.context(f.legal(), f.publicCaseId()).capabilities();
        assertFalse(before.approval().allowed(), "approval needs a fresh review of the exact snapshot");
        assertFalse(before.unlock().allowed());
        assertThrows(BusinessException.class, () -> context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(), f.legal()));

        var review = context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(), f.userId(), "Deed checked");
        assertEquals("FRESH", review.reviewStatus());
        var afterReview = read.context(f.legal(), f.publicCaseId()).capabilities();
        assertTrue(afterReview.approval().allowed());
        assertFalse(afterReview.unlock().allowed(), "APPROVE is separate from unlock");
        assertEquals("LEGAL_APPROVAL_REQUIRED", afterReview.unlock().blockedReason());

        var approvals = context.getBean(LegalApprovalService.class);
        approvals.decide(f.publicCaseId(), f.legal(), approve(read, f, "Deed and allocation checked"));
        assertEquals("LEGAL_BASIS_VERIFICATION", jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?", String.class, f.vaultId()));
        var afterApproval = read.context(f.legal(), f.publicCaseId()).capabilities();
        assertTrue(afterApproval.unlock().allowed());

        context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(), f.legal());
        assertEquals("UNLOCKED", jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?", String.class, f.vaultId()));
        assertEquals(1, count("audit_logs", "action='LEGAL_VAULT_UNLOCKED' AND vault_id=?", f.vaultId()));
        // A repeated unlock or decision after the vault is unlocked changes nothing.
        assertThrows(BusinessException.class, () -> context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(), f.legal()));
        assertThrows(BusinessException.class, () -> approvals.decide(f.publicCaseId(), f.legal(),
                new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, 1, "a".repeat(64), "b".repeat(64), "again")));
        assertEquals(1, count("audit_logs", "action='LEGAL_VAULT_UNLOCKED' AND vault_id=?", f.vaultId()));
    }

    @Test
    void notarialWithoutAStoredDeedIsBlockedEverywhereAndWritesNothing() {
        var f = notarial(false);
        var read = context.getBean(LegalReadService.class);
        context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(), f.userId(), "Reviewed");
        int audits = count("audit_logs", "vault_id=?", f.vaultId());

        var capabilities = read.context(f.legal(), f.publicCaseId()).capabilities();
        assertFalse(capabilities.approval().allowed());
        assertEquals(ErrorCode.BASIS_DOSSIER_INVALID_STATE.name(), capabilities.approval().blockedReason());
        assertFalse(capabilities.unlock().allowed());
        var request = approve(read, f, "Should not pass");
        assertEquals(ErrorCode.BASIS_DOSSIER_INVALID_STATE,
                assertThrows(BusinessException.class, () -> context.getBean(LegalApprovalService.class).decide(f.publicCaseId(), f.legal(), request)).getErrorCode());
        assertThrows(BusinessException.class, () -> context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(), f.legal()));
        assertEquals(audits, count("audit_logs", "vault_id=?", f.vaultId()));
    }

    @Test
    void notarialWithUnmatchedWillOrADisputeIsBlocked() {
        var f = notarial(true);
        var read = context.getBean(LegalReadService.class);
        context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(), f.userId(), "Reviewed");
        assertTrue(read.context(f.legal(), f.publicCaseId()).capabilities().approval().allowed());

        jdbc.update("INSERT dbo.will_comparisons (verification_case_id, original_will_intake_id, asset_version_id, referenced_sha256_hash, comparison_result, reason, checked_by_user_id, compared_at) "
                + "SELECT TOP 1 verification_case_id, original_will_intake_id, asset_version_id, referenced_sha256_hash, 'MISMATCH', 'Fixture mismatch', checked_by_user_id, DATEADD(SECOND, 5, SYSUTCDATETIME()) "
                + "FROM dbo.will_comparisons WHERE verification_case_id=?", f.caseId());
        var willBlocked = read.context(f.legal(), f.publicCaseId()).capabilities().approval();
        assertFalse(willBlocked.allowed());
        assertEquals(ErrorCode.WILL_NOT_VERIFIED.name(), willBlocked.blockedReason());
        var request = approve(read, f, "Should not pass");
        assertEquals(ErrorCode.WILL_NOT_VERIFIED,
                assertThrows(BusinessException.class, () -> context.getBean(LegalApprovalService.class).decide(f.publicCaseId(), f.legal(), request)).getErrorCode());

        jdbc.update("DELETE FROM dbo.will_comparisons WHERE verification_case_id=? AND comparison_result='MISMATCH'", f.caseId());
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET dispute_status='DISPUTED' WHERE verification_case_id=?", f.caseId());
        assertFalse(read.context(f.legal(), f.publicCaseId()).capabilities().approval().allowed());
    }

    @Test
    void newNotarialIntakeAndForwardRemainClosed() {
        var f = fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(), f.legal(),
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT, "Fixture"));
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET route='NOTARIAL' WHERE verification_case_id=?", f.caseId());
        assertThrows(BusinessException.class, () -> intakeVersion(f, "NOTARIAL_PARTITION"));
        assertThrows(BusinessException.class, () -> context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 1, f.legal()));
    }
}
