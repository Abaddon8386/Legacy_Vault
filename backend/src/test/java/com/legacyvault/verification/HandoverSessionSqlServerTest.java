package com.legacyvault.verification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.verification.dto.HandoverSessionStatusRequest;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.dto.CourtDecisionRequest;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisForwardService;
import com.legacyvault.verification.service.CourtDecisionService;
import com.legacyvault.verification.service.LegalApprovalService;
import com.legacyvault.verification.service.LegalBasisReviewService;
import com.legacyvault.verification.service.HandoverSessionService;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisForwardService;
import com.legacyvault.verification.service.CourtDecisionService;
import com.legacyvault.verification.service.LegalApprovalService;
import com.legacyvault.verification.service.LegalBasisReviewService;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.dto.CourtDecisionRequest;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class HandoverSessionSqlServerTest extends LegalBasisSqlServerSupport {
    private Fixture approvedFixture() {
        var f = fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(), f.legal(),
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT, "Dispute assessed by Legal"));
        intakeVersion(f, "COURT_JUDGMENT");
        context.getBean(BasisForwardService.class).forward(f.publicCaseId(), 1, f.legal());
        context.getBean(CourtDecisionService.class).record(f.publicCaseId(), f.legal(),
                new CourtDecisionRequest(1, CourtDecisionRequest.Result.VALID, "Legal assessed current evidence"));
        var review = context.getBean(LegalBasisReviewService.class)
                .recordCompletedReviewByCasePublicId(f.publicCaseId(), f.userId(), "Reviewed current dossier snapshot");
        context.getBean(LegalApprovalService.class).decide(f.publicCaseId(), f.legal(),
                new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE, review.currentVersionNo(),
                        review.currentSha256Hash(), review.currentAllocationHash(), "Approved current scope"));
        return f;
    }

    @Test
    void openCancelAndReopenKeepsHistoryAndAuditsEachTransition() {
        var f = approvedFixture();
        jdbc.update("UPDATE dbo.vaults SET status='UNLOCKED' WHERE vault_id=?", f.vaultId());
        var service = context.getBean(HandoverSessionService.class);

        var first = service.open(f.publicCaseId(), f.legal());
        assertEquals(HandoverSessionStatus.OPEN, first.status());
        assertThrows(BusinessException.class, () -> service.open(f.publicCaseId(), f.legal()));

        var cancelled = service.updateStatus(f.publicCaseId(), first.sessionId(),
                new HandoverSessionStatusRequest(HandoverSessionStatusRequest.TerminalStatus.CANCELLED), f.legal());
        assertEquals(HandoverSessionStatus.CANCELLED, cancelled.status());
        assertNotNull(cancelled.closedAt());

        var reopened = service.open(f.publicCaseId(), f.legal());
        assertNotEquals(first.sessionId(), reopened.sessionId());
        assertEquals(2, count("handover_sessions", "verification_case_id = ?", f.caseId()));
        assertEquals(1, count("handover_sessions", "verification_case_id = ? AND status = 'OPEN'", f.caseId()));
        assertEquals(2, count("audit_logs", "vault_id = ? AND action = 'HANDOVER_SESSION_OPENED'", f.vaultId()));
        assertEquals(1, count("audit_logs", "vault_id = ? AND action = 'HANDOVER_SESSION_CANCELLED'", f.vaultId()));
    }

    @Test
    void concurrentOpenRequestsCreateExactlyOneOpenSession() throws Exception {
        var f = approvedFixture();
        jdbc.update("UPDATE dbo.vaults SET status='UNLOCKED' WHERE vault_id=?", f.vaultId());
        var service = context.getBean(HandoverSessionService.class);
        var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var tasks = List.of(
                    (java.util.concurrent.Callable<Boolean>) () -> attemptOpen(service, f, barrier),
                    () -> attemptOpen(service, f, barrier));
            var results = pool.invokeAll(tasks).stream().map(future -> {
                try { return future.get(); }
                catch (Exception e) { throw new RuntimeException(e); }
            }).toList();
            assertEquals(1, results.stream().filter(Boolean::booleanValue).count());
        }
        assertEquals(1, count("handover_sessions", "verification_case_id = ? AND status = 'OPEN'", f.caseId()));
        assertEquals(1, count("audit_logs", "vault_id = ? AND action = 'HANDOVER_SESSION_OPENED'", f.vaultId()));
    }

    @Test
    void unlockedVaultIsRequiredEvenForAssignedOpenCase() {
        var f = approvedFixture();
        assertThrows(BusinessException.class, () -> context.getBean(HandoverSessionService.class)
                .open(f.publicCaseId(), f.legal()));
        assertEquals(0, count("handover_sessions", "verification_case_id = ?", f.caseId()));
    }

    @Test
    void failedAuditRollsBackSessionInsert() {
        var f = approvedFixture();
        jdbc.update("UPDATE dbo.vaults SET status='UNLOCKED' WHERE vault_id=?", f.vaultId());
        jdbc.execute("""
                CREATE TRIGGER dbo.TR_TestFailHandoverAudit ON dbo.audit_logs AFTER INSERT AS
                BEGIN
                    IF EXISTS (SELECT 1 FROM inserted WHERE action = 'HANDOVER_SESSION_OPENED')
                        THROW 51060, 'test audit failure', 1;
                END
                """);
        try {
            assertThrows(RuntimeException.class, () -> context.getBean(HandoverSessionService.class)
                    .open(f.publicCaseId(), f.legal()));
        } finally {
            jdbc.execute("DROP TRIGGER dbo.TR_TestFailHandoverAudit");
        }
        assertEquals(0, count("handover_sessions", "verification_case_id = ?", f.caseId()));
        assertEquals(0, count("audit_logs", "vault_id = ? AND action = 'HANDOVER_SESSION_OPENED'", f.vaultId()));
    }

    @Test
    void staffCannotOpenForCancelledCase() {
        var f = approvedFixture();
        jdbc.update("UPDATE dbo.vaults SET status='UNLOCKED' WHERE vault_id=?", f.vaultId());
        jdbc.update("UPDATE dbo.verification_cases SET status='CANCELLED', closed_at=SYSUTCDATETIME() WHERE verification_case_id=?", f.caseId());
        assertThrows(BusinessException.class, () -> context.getBean(HandoverSessionService.class)
                .open(f.publicCaseId(), f.legal()));
        assertEquals(0, count("handover_sessions", "verification_case_id = ?", f.caseId()));
    }

    private boolean attemptOpen(HandoverSessionService service, Fixture f, CyclicBarrier barrier) throws Exception {
        barrier.await();
        try {
            service.open(f.publicCaseId(), f.legal());
            return true;
        } catch (BusinessException duplicate) {
            return false;
        }
    }
}
