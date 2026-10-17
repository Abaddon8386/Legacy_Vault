package com.legacyvault.verification;

import com.legacyvault.common.error.*;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class LegalHoldSqlServerTest extends LegalBasisSqlServerSupport {
    private Fixture court(boolean forward) {
        var f = fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(), f.legal(),
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT, "Dispute assessed by Legal"));
        intakeVersion(f, "COURT_JUDGMENT");
        if (forward) forward(f, 1);
        return f;
    }
    private void forward(Fixture f, int version) { context.getBean(BasisForwardService.class).forward(f.publicCaseId(), version, f.legal()); }
    private void assess(Fixture f, int version) {
        context.getBean(CourtDecisionService.class).record(f.publicCaseId(), f.legal(),
                new CourtDecisionRequest(version, CourtDecisionRequest.Result.VALID, "Legal assessed valid court evidence"));
    }
    private BasisDossierResponse hold(Fixture f) {
        return context.getBean(LegalBasisHoldService.class).hold(f.publicCaseId(), f.legal(),
                new HoldBasisRequest(HoldBasisRequest.Cause.NEW_DISPUTE, "Private new dispute"));
    }
    private void gate(Fixture f) {
        for (var transition : LegalWorkflowGuard.ProtectedTransition.values())
            tx.executeWithoutResult(s -> context.getBean(LegalWorkflowGuard.class).requireProtectedTransition(f.publicCaseId(), transition));
    }
    private void blocked(Fixture f) {
        for (var transition : LegalWorkflowGuard.ProtectedTransition.values())
            assertThrows(BusinessException.class, () -> tx.executeWithoutResult(s ->
                    context.getBean(LegalWorkflowGuard.class).requireProtectedTransition(f.publicCaseId(), transition)));
    }
    private Long dossierId(Fixture f) { return jdbc.queryForObject("SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id = ?", Long.class, f.caseId()); }
    private int auditCount(Fixture f, String action) { return count("audit_logs", "vault_id = ? AND action = ?", f.vaultId(), action); }

    @Test
    void newDisputePreservesHistoryAndRequiresNewForwardedVersionAndNewAssessment() {
        var f = court(true);
        assess(f, 1);
        gate(f);
        var original = context.getBean(BasisDossierViewService.class).forLegal(f.publicCaseId()).versions().getFirst();
        var held = hold(f);
        assertEquals("ON_HOLD", held.route());
        assertEquals(2, held.requiredVersion());
        assertEquals(1, held.versions().size());
        assertEquals(original.sha256(), held.versions().getFirst().sha256());
        blocked(f);
        assertThrows(BusinessException.class, () -> intakeVersion(f, "COURT_JUDGMENT"));
        assertThrows(BusinessException.class, () -> forward(f, 1));
        assertThrows(BusinessException.class, () -> assess(f, 1));
        var resumed = context.getBean(BasisReclassificationService.class).reclassify(f.publicCaseId(), f.legal(),
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT, "Legal reviewed new evidence"));
        assertEquals(2, resumed.requiredVersion());
        blocked(f);
        assertThrows(BusinessException.class, () -> forward(f, 1));
        intakeVersion(f, "COURT_DECISION");
        forward(f, 2);
        blocked(f); // The old VALID assessment remains history, never clears version 2.
        assess(f, 2);
        gate(f);
        assertEquals(2, context.getBean(CourtDecisionService.class).history(f.publicCaseId()).size());
        assertEquals(2, count("legal_basis_dossier_versions", "legal_basis_dossier_id = ?", dossierId(f)));
        assertEquals(2, count("legal_basis_classification_history", "legal_basis_dossier_id = ?", dossierId(f)));
        assertEquals(1, auditCount(f, "LEGAL_BASIS_HELD"));
        assertFalse(jdbc.queryForObject("SELECT details FROM dbo.audit_logs WHERE vault_id = ? AND action = 'LEGAL_BASIS_HELD'", String.class, f.vaultId()).contains("Private new dispute"));
        assertEquals("LEGAL_BASIS_VERIFICATION", jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id = ?", String.class, f.vaultId()));
    }

    @Test
    void holdBeforeAnyDocumentRequiresFirstVersionAndRepeatedHoldDoesNotDuplicateHistory() {
        var f = fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(), f.legal(),
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.NOTARIAL, "No dispute at classification"));
        var response = context.getBean(LegalBasisHoldService.class).hold(f.publicCaseId(), f.legal(),
                new HoldBasisRequest(HoldBasisRequest.Cause.INSUFFICIENT_EVIDENCE, "More evidence needed"));
        assertEquals(1, response.requiredVersion());
        blocked(f);
        assertThrows(BusinessException.class, () -> hold(f));
        assertEquals(1, count("legal_basis_classification_history", "legal_basis_dossier_id = ?", dossierId(f)));
        assertEquals(1, auditCount(f, "LEGAL_BASIS_HELD"));
    }

    @Test
    void auditFailureRollsBackHoldHistoryAndRequiredVersion() {
        var f = court(true);
        assess(f, 1);
        jdbc.execute("CREATE TRIGGER dbo.TR_test_hold_audit_failure ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE action = 'LEGAL_BASIS_HELD') THROW 51000, 'Injected hold audit failure', 1; END");
        try {
            assertThrows(RuntimeException.class, () -> hold(f));
            gate(f);
            var response = context.getBean(BasisDossierViewService.class).forLegal(f.publicCaseId());
            assertEquals("COURT", response.route());
            assertEquals(1, response.requiredVersion());
            assertEquals(0, count("legal_basis_classification_history", "legal_basis_dossier_id = ?", dossierId(f)));
        } finally { jdbc.execute("DROP TRIGGER dbo.TR_test_hold_audit_failure"); }
    }

    @Test
    void cachedClearanceCannotBypassACommittedHold() {
        var f = court(true);
        assess(f, 1);
        tx.executeWithoutResult(status -> {
            var cached = context.getBean(LegalBasisDossierRepository.class).findByVerificationCaseId(f.caseId()).orElseThrow();
            assertEquals(LegalBasisDossier.ROUTE_COURT, cached.getRoute());
            try (var worker = Executors.newSingleThreadExecutor()) {
                worker.submit(() -> hold(f)).get(10, TimeUnit.SECONDS);
            } catch (Exception ex) { throw new IllegalStateException(ex); }
            var error = assertThrows(BusinessException.class, () -> context.getBean(LegalWorkflowGuard.class)
                    .requireProtectedTransition(f.publicCaseId(), LegalWorkflowGuard.ProtectedTransition.UNLOCK));
            assertEquals(ErrorCode.LEGAL_WORKFLOW_ON_HOLD, error.getErrorCode());
            status.setRollbackOnly();
        });
        blocked(f);
    }

    @Test void holdCommitsBeforeForwardSoForwardIsRejected() throws Exception { concurrentForwardAndHold(true); }
    @Test void forwardCommitsBeforeHoldSoHistoryIsPreservedAndReviewInvalidated() throws Exception { concurrentForwardAndHold(false); }

    private void concurrentForwardAndHold(boolean holdFirst) throws Exception {
        var f = court(false);
        CountDownLatch firstWritten = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> tx.executeWithoutResult(s -> {
                if (holdFirst) hold(f); else forward(f, 1);
                firstWritten.countDown();
                await(commit);
            }));
            try {
                assertTrue(firstWritten.await(10, TimeUnit.SECONDS));
                var second = workers.submit(() -> {
                    if (holdFirst) assertThrows(BusinessException.class, () -> forward(f, 1));
                    else hold(f);
                });
                assertThrows(TimeoutException.class, () -> second.get(300, TimeUnit.MILLISECONDS));
                commit.countDown();
                first.get(15, TimeUnit.SECONDS);
                second.get(15, TimeUnit.SECONDS);
                blocked(f);
                assertEquals(1, auditCount(f, "LEGAL_BASIS_HELD"));
                assertEquals(holdFirst ? 0 : 1, auditCount(f, "LEGAL_BASIS_FORWARDED"));
                assertEquals(1, count("legal_basis_dossier_versions", "legal_basis_dossier_id = ?", dossierId(f)));
            } finally { commit.countDown(); }
        }
    }

    @Test void holdBeforeCourtAssessmentPreventsRecording() throws Exception { concurrentAssessmentAndHold(true); }
    @Test void courtAssessmentBeforeHoldRemainsHistoryWithoutClearingHold() throws Exception { concurrentAssessmentAndHold(false); }

    private void concurrentAssessmentAndHold(boolean holdFirst) throws Exception {
        var f = court(true);
        CountDownLatch firstWritten = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> tx.executeWithoutResult(s -> {
                if (holdFirst) hold(f); else assess(f, 1);
                firstWritten.countDown();
                await(commit);
            }));
            try {
                assertTrue(firstWritten.await(10, TimeUnit.SECONDS));
                var second = workers.submit(() -> {
                    if (holdFirst) assertThrows(BusinessException.class, () -> assess(f, 1)); else hold(f);
                });
                assertThrows(TimeoutException.class, () -> second.get(300, TimeUnit.MILLISECONDS));
                commit.countDown();
                first.get(15, TimeUnit.SECONDS);
                second.get(15, TimeUnit.SECONDS);
                blocked(f);
                assertEquals(holdFirst ? 0 : 1, context.getBean(CourtDecisionService.class).history(f.publicCaseId()).size());
            } finally { commit.countDown(); }
        }
    }

    @Test void cancelledCaseCannotBeHeldOrResumed() {
        var f = court(true);
        jdbc.update("UPDATE dbo.verification_cases SET status = 'CANCELLED', closed_at = SYSUTCDATETIME() WHERE verification_case_id = ?", f.caseId());
        assertThrows(BusinessException.class, () -> hold(f));
        blocked(f);
    }

    @Test void eitherVaultOrDossierHoldBlocksAllProtectedTransitions() {
        var f = court(true);
        assess(f, 1);
        jdbc.update("UPDATE dbo.vaults SET status = 'ON_HOLD' WHERE vault_id = ?", f.vaultId());
        blocked(f);
        jdbc.update("UPDATE dbo.vaults SET status = 'LEGAL_BASIS_VERIFICATION' WHERE vault_id = ?", f.vaultId());
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET route = 'ON_HOLD' WHERE verification_case_id = ?", f.caseId());
        blocked(f);
    }

    @Test void holdBeforeIntakePreventsNewEvidenceFromBypassingHold() throws Exception { concurrentIntakeAndHold(true); }
    @Test void intakeBeforeHoldIsPreservedAndRequiresAnotherNewVersion() throws Exception { concurrentIntakeAndHold(false); }

    private void concurrentIntakeAndHold(boolean holdFirst) throws Exception {
        var f = court(false);
        CountDownLatch firstWritten = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> tx.executeWithoutResult(s -> {
                if (holdFirst) hold(f); else intakeVersion(f, "COURT_DECISION");
                firstWritten.countDown();
                await(commit);
            }));
            try {
                assertTrue(firstWritten.await(10, TimeUnit.SECONDS));
                var second = workers.submit(() -> {
                    if (holdFirst) assertThrows(BusinessException.class, () -> intakeVersion(f, "COURT_DECISION"));
                    else hold(f);
                });
                assertThrows(TimeoutException.class, () -> second.get(300, TimeUnit.MILLISECONDS));
                commit.countDown();
                first.get(15, TimeUnit.SECONDS);
                second.get(15, TimeUnit.SECONDS);
                var response = context.getBean(BasisDossierViewService.class).forLegal(f.publicCaseId());
                assertEquals(holdFirst ? 2 : 3, response.requiredVersion());
                assertEquals(holdFirst ? 1 : 2, response.versions().size());
                blocked(f);
            } finally { commit.countDown(); }
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Competing transaction timeout");
        } catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw new IllegalStateException(ex); }
    }
}
