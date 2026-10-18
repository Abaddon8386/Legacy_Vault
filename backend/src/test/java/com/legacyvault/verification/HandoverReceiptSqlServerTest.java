package com.legacyvault.verification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.verification.dto.CreateHandoverReceiptRequest;
import com.legacyvault.verification.dto.HandoverSessionStatusRequest;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisForwardService;
import com.legacyvault.verification.service.HandoverReceiptService;
import com.legacyvault.verification.service.HandoverSessionService;
import com.legacyvault.verification.service.LegalApprovalService;
import com.legacyvault.verification.service.LegalBasisReviewService;
import com.legacyvault.verification.service.LegalVaultUnlockService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class HandoverReceiptSqlServerTest extends LegalBasisSqlServerSupport {
    @Test
    void receiptSnapshotsApprovedAllocationAndReissueKeepsOldHistory() {
        var f = completedHandover();
        var request = new CreateHandoverReceiptRequest(f.recipientId(), java.util.List.of(f.assetId()), null);
        var service = context.getBean(HandoverReceiptService.class);
        var first = service.create(f.publicCaseId(), f.sessionId(), request, f.legal());

        assertEquals(f.recipientId(), first.recipientId());
        assertEquals(java.util.List.of(f.assetId()), first.assetIds());
        assertEquals(f.legal().publicId(), first.staffId());
        assertEquals("STAFF_ATTESTATION", first.confirmationType());
        assertNotNull(first.confirmedAt());
        assertEquals(1, count("handover_receipts", "handover_session_id = ?", f.sessionDbId()));
        assertEquals(1, count("handover_receipt_assets", "handover_receipt_id = (SELECT handover_receipt_id FROM dbo.handover_receipts WHERE public_id = ?)", first.receiptId()));
        assertEquals(1, count("audit_logs", "vault_id = ? AND action = 'HANDOVER_RECEIPT_STAFF_CONFIRMED'", f.vaultId()));

        var replacement = service.create(f.publicCaseId(), f.sessionId(),
                new CreateHandoverReceiptRequest(f.recipientId(), java.util.List.of(f.assetId()), first.receiptId()), f.legal());
        assertEquals(first.receiptId(), replacement.supersedesReceiptId());
        assertEquals(2, count("handover_receipts", "handover_session_id = ?", f.sessionDbId()));
        assertEquals(2, service.list(f.publicCaseId(), f.sessionId(), f.legal()).size());

        assertThrows(RuntimeException.class, () -> jdbc.update(
                "UPDATE dbo.handover_receipts SET dossier_version_no = dossier_version_no + 1 WHERE public_id = ?",
                first.receiptId().toString()));
        assertThrows(RuntimeException.class, () -> jdbc.update(
                "DELETE FROM dbo.handover_receipt_assets WHERE handover_receipt_id = (SELECT handover_receipt_id FROM dbo.handover_receipts WHERE public_id = ?)",
                first.receiptId().toString()));
        assertEquals(2, count("handover_receipts", "handover_session_id = ?", f.sessionDbId()));
    }

    @Test
    void auditFailureRollsBackReceiptAndAssetSnapshot() {
        var f = completedHandover();
        jdbc.execute("CREATE TRIGGER dbo.TR_test_reject_receipt_audit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE action = 'HANDOVER_RECEIPT_STAFF_CONFIRMED') THROW 51063, 'Injected receipt audit failure', 1; END");
        try {
            assertThrows(RuntimeException.class, () -> context.getBean(HandoverReceiptService.class).create(
                    f.publicCaseId(), f.sessionId(), new CreateHandoverReceiptRequest(
                            f.recipientId(), java.util.List.of(f.assetId()), null), f.legal()));
        } finally {
            jdbc.execute("DROP TRIGGER dbo.TR_test_reject_receipt_audit");
        }
        assertEquals(0, count("handover_receipts", "handover_session_id = ?", f.sessionDbId()));
        assertEquals(0, count("handover_receipt_assets", "handover_receipt_id IN (SELECT handover_receipt_id FROM dbo.handover_receipts WHERE handover_session_id = ?)", f.sessionDbId()));
        assertEquals(0, count("audit_logs", "vault_id = ? AND action = 'HANDOVER_RECEIPT_STAFF_CONFIRMED'", f.vaultId()));
    }

    private FixtureWithSession completedHandover() {
        var f = fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(), f.legal(),
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.NOTARIAL, "Fixture classification"));
        var intake = intakeVersion(f, "NOTARIAL_PARTITION");
        var allocation = intake.versions().getFirst().allocations().getFirst();
        context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 1, f.legal());
        var review = context.getBean(LegalBasisReviewService.class)
                .recordCompletedReviewByCasePublicId(f.publicCaseId(), f.userId(), "Fixture review");
        context.getBean(LegalApprovalService.class).decide(f.publicCaseId(), f.legal(),
                new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, review.currentVersionNo(),
                        review.currentSha256Hash(), review.currentAllocationHash(), "Fixture approval"));
        context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(), f.legal());
        jdbc.update("UPDATE dbo.beneficiaries SET identity_verification_status = 'VERIFIED_AT_COUNTER' WHERE public_id = ?",
                allocation.beneficiaryId().toString());
        var sessions = context.getBean(HandoverSessionService.class);
        var session = sessions.open(f.publicCaseId(), f.legal());
        sessions.updateStatus(f.publicCaseId(), session.sessionId(), new HandoverSessionStatusRequest(
                HandoverSessionStatusRequest.TerminalStatus.COMPLETED), f.legal());
        Long sessionDbId = jdbc.queryForObject("SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id = ?",
                Long.class, session.sessionId().toString());
        return new FixtureWithSession(f, session.sessionId(), sessionDbId,
                allocation.beneficiaryId(), allocation.assetId());
    }

    private record FixtureWithSession(Fixture fixture, java.util.UUID sessionId, Long sessionDbId,
            java.util.UUID recipientId, java.util.UUID assetId) {
        java.util.UUID publicCaseId() { return fixture.publicCaseId(); }
        com.legacyvault.common.security.CustomUserPrincipal legal() { return fixture.legal(); }
        long userId() { return fixture.userId(); }
        long vaultId() { return fixture.vaultId(); }
    }
}
