package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.service.BasisForwardService;
import com.legacyvault.verification.service.LegalApprovalService;
import com.legacyvault.verification.service.LegalBasisReviewService;
import com.legacyvault.verification.service.LegalReadService;
import com.legacyvault.verification.service.LegalVaultUnlockService;

/**
 * NOTARIAL end to end on real SQL Server: Staff receives the deed with no prior Legal classification, forwards the
 * stored version, Legal reviews, approves and (separately) unlocks.
 */
class LegalNotarialSqlServerTest extends LegalBasisSqlServerSupport {

    private static final String NOTARIAL = "NOTARIAL_PARTITION";
    private static final String DOSSIER_OF_CASE =
            "(SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?)";

    /** Staff receives the deed (the dossier does not exist yet) and forwards it. The vault starts at WILL_VERIFICATION. */
    private Fixture forwardedNotarial(boolean deed) {
        var f = fixture(true);
        intakeVersion(f, NOTARIAL);
        if (!deed) {
            jdbc.update("UPDATE dbo.legal_basis_dossier_versions SET notary_authority=NULL "
                    + "WHERE legal_basis_dossier_id IN " + DOSSIER_OF_CASE, f.caseId());
        }
        context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 1, f.legal());
        return f;
    }

    private String vaultStatus(Fixture f) {
        return jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?", String.class, f.vaultId());
    }

    private String dossierColumn(Fixture f, String column) {
        return jdbc.queryForObject("SELECT " + column + " FROM dbo.legal_basis_dossiers WHERE verification_case_id=?",
                String.class, f.caseId());
    }

    private LegalApprovalRequest approve(Fixture f, String reason) {
        var s = context.getBean(LegalReadService.class).context(f.legal(), f.publicCaseId()).snapshot();
        return new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, s.currentVersion(), s.sha256Hash(),
                s.allocationHash(), reason);
    }

    @Test
    void staffIntakeOpensANotarialDossierWithoutClassifyingOrForwardingIt() {
        var f = fixture(true);
        assertEquals(0, count("legal_basis_dossiers", "verification_case_id=?", f.caseId()));

        intakeVersion(f, NOTARIAL);

        assertEquals("NOTARIAL", dossierColumn(f, "route"));
        assertEquals("NONE", dossierColumn(f, "dispute_status"));
        assertEquals("LEGAL_BASIS_PROVIDED", dossierColumn(f, "status"));
        assertNull(dossierColumn(f, "classified_by_user_id"));
        assertEquals("NOT_FORWARDED", jdbc.queryForObject("SELECT forward_status FROM dbo.legal_basis_dossier_versions "
                + "WHERE legal_basis_dossier_id IN " + DOSSIER_OF_CASE, String.class, f.caseId()));
        assertEquals("WILL_VERIFICATION", vaultStatus(f), "receiving a document never moves the vault");
        assertEquals(0, count("audit_logs", "action='LEGAL_BASIS_CLASSIFIED' AND vault_id=?", f.vaultId()));
        assertEquals(1, count("audit_logs", "action='LEGAL_BASIS_RECEIVED' AND vault_id=?", f.vaultId()));
    }

    @Test
    void phaseOneCannotBeSkipped_andForwardIsSingleShot() {
        var early = fixture(true);
        jdbc.update("UPDATE dbo.vaults SET status='AWAITING_VERIFICATION' WHERE vault_id=?", early.vaultId());
        assertEquals(ErrorCode.BASIS_DOSSIER_INVALID_STATE,
                assertThrows(BusinessException.class, () -> intakeVersion(early, NOTARIAL)).getErrorCode());
        assertEquals(0, count("legal_basis_dossiers", "verification_case_id=?", early.caseId()));
        assertEquals(0, count("audit_logs", "vault_id=?", early.vaultId()));

        var f = forwardedNotarial(true);
        assertEquals("LEGAL_BASIS_VERIFICATION", vaultStatus(f));
        int audits = count("audit_logs", "vault_id=?", f.vaultId());
        // A repeated forward neither re-forwards nor writes anything.
        assertThrows(BusinessException.class, () -> context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 1, f.legal()));
        assertEquals(audits, count("audit_logs", "vault_id=?", f.vaultId()));
        assertEquals(1, count("legal_basis_dossier_versions", "forward_status='FORWARDED' AND legal_basis_dossier_id IN "
                + DOSSIER_OF_CASE, f.caseId()));
    }

    @Test
    void forwardNeedsAStoredVersionOfTheCase() {
        var f = fixture(true);
        intakeVersion(f, NOTARIAL);
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND,
                assertThrows(BusinessException.class, () -> context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 2, f.legal())).getErrorCode());
        var other = fixture(true);
        assertThrows(BusinessException.class, () -> context.getBean(BasisForwardService.class).forward(other.publicCaseId(), 1, other.legal()));
    }

    @Test
    void notarialWithDeedAndMatchingWill_reviewsApprovesAndUnlocksOnceInOrder() {
        var f = forwardedNotarial(true);
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
        approvals.decide(f.publicCaseId(), f.legal(), approve(f, "Deed and allocation checked"));
        assertEquals("LEGAL_BASIS_VERIFICATION", vaultStatus(f));
        assertTrue(read.context(f.legal(), f.publicCaseId()).capabilities().unlock().allowed());

        context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(), f.legal());
        assertEquals("UNLOCKED", vaultStatus(f));
        assertEquals(1, count("audit_logs", "action='LEGAL_VAULT_UNLOCKED' AND vault_id=?", f.vaultId()));
        assertThrows(BusinessException.class, () -> context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(), f.legal()));
        assertThrows(BusinessException.class, () -> approvals.decide(f.publicCaseId(), f.legal(),
                new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, 1, "a".repeat(64), "b".repeat(64), "again")));
        assertEquals(1, count("audit_logs", "action='LEGAL_VAULT_UNLOCKED' AND vault_id=?", f.vaultId()));
    }

    @Test
    void notarialWithoutTheNotaryIsBlockedEverywhereAndWritesNothing() {
        var f = forwardedNotarial(false);
        var read = context.getBean(LegalReadService.class);
        context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(), f.userId(), "Reviewed");
        int audits = count("audit_logs", "vault_id=?", f.vaultId());

        var capabilities = read.context(f.legal(), f.publicCaseId()).capabilities();
        assertFalse(capabilities.approval().allowed());
        assertEquals(ErrorCode.BASIS_DOSSIER_INVALID_STATE.name(), capabilities.approval().blockedReason());
        assertFalse(capabilities.unlock().allowed());
        var request = approve(f, "Should not pass");
        assertEquals(ErrorCode.BASIS_DOSSIER_INVALID_STATE,
                assertThrows(BusinessException.class, () -> context.getBean(LegalApprovalService.class).decide(f.publicCaseId(), f.legal(), request)).getErrorCode());
        assertThrows(BusinessException.class, () -> context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(), f.legal()));
        assertEquals(audits, count("audit_logs", "vault_id=?", f.vaultId()));
    }

    @Test
    void notarialWithUnmatchedWillOrADisputeIsBlocked_andAChangedVersionMakesTheDecisionStale() {
        var f = forwardedNotarial(true);
        var read = context.getBean(LegalReadService.class);
        context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(), f.userId(), "Reviewed");
        assertTrue(read.context(f.legal(), f.publicCaseId()).capabilities().approval().allowed());
        var staleRequest = approve(f, "Based on the old version");

        jdbc.update("INSERT dbo.will_comparisons (verification_case_id, original_will_intake_id, asset_version_id, referenced_sha256_hash, comparison_result, reason, checked_by_user_id, compared_at) "
                + "SELECT TOP 1 verification_case_id, original_will_intake_id, asset_version_id, referenced_sha256_hash, 'MISMATCH', 'Fixture mismatch', checked_by_user_id, DATEADD(SECOND, 5, SYSUTCDATETIME()) "
                + "FROM dbo.will_comparisons WHERE verification_case_id=?", f.caseId());
        var willBlocked = read.context(f.legal(), f.publicCaseId()).capabilities().approval();
        assertFalse(willBlocked.allowed());
        assertEquals(ErrorCode.WILL_NOT_VERIFIED.name(), willBlocked.blockedReason());
        assertEquals(ErrorCode.WILL_NOT_VERIFIED,
                assertThrows(BusinessException.class, () -> context.getBean(LegalApprovalService.class).decide(f.publicCaseId(), f.legal(), approve(f, "Should not pass"))).getErrorCode());

        jdbc.update("DELETE FROM dbo.will_comparisons WHERE verification_case_id=? AND comparison_result='MISMATCH'", f.caseId());
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET dispute_status='DISPUTED' WHERE verification_case_id=?", f.caseId());
        assertFalse(read.context(f.legal(), f.publicCaseId()).capabilities().approval().allowed());
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET dispute_status='NONE' WHERE verification_case_id=?", f.caseId());

        // Legal returned the dossier for supplementation and Staff stored a newer version: the old snapshot is stale.
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET status='LEGAL_BASIS_PROVIDED' WHERE verification_case_id=?", f.caseId());
        jdbc.update("UPDATE dbo.vaults SET status='AWAITING_LEGAL_BASIS' WHERE vault_id=?", f.vaultId());
        intakeVersion(f, NOTARIAL);
        assertThrows(BusinessException.class, () -> context.getBean(LegalApprovalService.class).decide(f.publicCaseId(), f.legal(), staleRequest));
    }
}
