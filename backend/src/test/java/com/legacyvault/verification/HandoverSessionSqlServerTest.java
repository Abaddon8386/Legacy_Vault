package com.legacyvault.verification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.verification.dto.HandoverSessionStatusRequest;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.service.HandoverSessionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class HandoverSessionSqlServerTest extends LegalBasisSqlServerSupport {
    @Test
    void openCompleteAndReopenKeepsHistoryAndAuditsEachTransition() {
        var f = fixture(false);
        jdbc.update("UPDATE dbo.vaults SET status='UNLOCKED' WHERE vault_id=?", f.vaultId());
        var service = context.getBean(HandoverSessionService.class);

        var first = service.open(f.publicCaseId(), f.legal());
        assertEquals(HandoverSessionStatus.OPEN, first.status());
        assertThrows(BusinessException.class, () -> service.open(f.publicCaseId(), f.legal()));

        var completed = service.updateStatus(f.publicCaseId(), first.sessionId(),
                new HandoverSessionStatusRequest(HandoverSessionStatusRequest.TerminalStatus.COMPLETED), f.legal());
        assertEquals(HandoverSessionStatus.COMPLETED, completed.status());
        assertNotNull(completed.closedAt());

        var reopened = service.open(f.publicCaseId(), f.legal());
        assertNotEquals(first.sessionId(), reopened.sessionId());
        assertEquals(2, count("handover_sessions", "verification_case_id = ?", f.caseId()));
        assertEquals(1, count("handover_sessions", "verification_case_id = ? AND status = 'OPEN'", f.caseId()));
        assertEquals(2, count("audit_logs", "vault_id = ? AND action = 'HANDOVER_SESSION_OPENED'", f.vaultId()));
        assertEquals(1, count("audit_logs", "vault_id = ? AND action = 'HANDOVER_SESSION_COMPLETED'", f.vaultId()));
    }

    @Test
    void concurrentOpenRequestsCreateExactlyOneOpenSession() throws Exception {
        var f = fixture(false);
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
        var f = fixture(false);
        assertThrows(BusinessException.class, () -> context.getBean(HandoverSessionService.class)
                .open(f.publicCaseId(), f.legal()));
        assertEquals(0, count("handover_sessions", "verification_case_id = ?", f.caseId()));
    }

    @Test
    void failedAuditRollsBackSessionInsert() {
        var f = fixture(false);
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
        var f = fixture(false);
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
