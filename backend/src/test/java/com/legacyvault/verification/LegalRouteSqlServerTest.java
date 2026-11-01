package com.legacyvault.verification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.dto.ClassifyBasisRequest.Route;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.service.BasisClassificationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class LegalRouteSqlServerTest extends LegalBasisSqlServerSupport {
    private BasisClassificationService service() { return context.getBean(BasisClassificationService.class); }

    @Test
    void allRoutesPersistReasonAndValidJsonAuditWithoutLeakingReason() {
        for (Route route : new Route[]{Route.COURT, Route.ON_HOLD}) {
            var f = fixture(true);
            String reason = "Private classification evidence " + route;
            var result = service().classify(f.publicCaseId(), f.legal(), new ClassifyBasisRequest(route, reason));
            assertEquals(route.name(), result.route());
            assertEquals(reason, result.routeReason());
            assertEquals(f.legal().publicId(), result.classifiedBy());
            String expectedVault = route == Route.ON_HOLD ? "ON_HOLD" : "AWAITING_LEGAL_BASIS";
            assertEquals(expectedVault, jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id = ?", String.class, f.vaultId()));
            String details = jdbc.queryForObject("SELECT details FROM dbo.audit_logs WHERE vault_id = ? AND action = 'LEGAL_BASIS_CLASSIFIED'", String.class, f.vaultId());
            assertFalse(details.contains(reason));
            assertEquals(1, count("audit_logs", "vault_id = ? AND ISJSON(state_before) = 1 AND ISJSON(state_after) = 1", f.vaultId()));
            assertThrows(BusinessException.class, () -> service().classify(f.publicCaseId(), f.legal(), new ClassifyBasisRequest(route, "Repeated")));
            assertEquals(1, count("legal_basis_dossiers", "verification_case_id = ?", f.caseId()));
        }
    }

    @Test
    void absentWillDoesNotBlockClassification_andNotarialIsAcceptedAlongsideCourt() {
        var f = fixture(false);
        jdbc.update("UPDATE dbo.vaults SET status='DOCUMENT_VERIFICATION' WHERE vault_id=?",f.vaultId());
        assertEquals("COURT",service().classify(f.publicCaseId(),f.legal(),new ClassifyBasisRequest(Route.COURT,"Court evidence next")).route());
        assertEquals(0,count("will_comparisons","verification_case_id=?",f.caseId()));
        var notarial = fixture(false);
        jdbc.update("UPDATE dbo.vaults SET status='DOCUMENT_VERIFICATION' WHERE vault_id=?",notarial.vaultId());
        assertEquals("NOTARIAL",service().classify(notarial.publicCaseId(),notarial.legal(),new ClassifyBasisRequest(Route.NOTARIAL,"Notarial deed expected")).route());
        assertEquals("NONE",jdbc.queryForObject("SELECT dispute_status FROM dbo.legal_basis_dossiers WHERE verification_case_id=?",String.class,notarial.caseId()));
        assertEquals("AWAITING_LEGAL_BASIS",jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?",String.class,notarial.vaultId()));
    }

    @Test
    void staleManagedOpenCaseDoesNotBypassCommittedCancellation() {
        var f = fixture(true);
        tx.executeWithoutResult(status -> {
            var cached = context.getBean(LegalCaseLookupRepository.class).findByPublicId(f.publicCaseId()).orElseThrow();
            assertTrue(cached.isOpen());
            try (var worker = Executors.newSingleThreadExecutor()) {
                worker.submit(() -> jdbc.update("UPDATE dbo.verification_cases SET status = 'CANCELLED', closed_at = SYSUTCDATETIME() WHERE verification_case_id = ?", f.caseId())).get(10, TimeUnit.SECONDS);
            } catch (Exception ex) { throw new IllegalStateException(ex); }
            var error = assertThrows(BusinessException.class, () -> service().classify(f.publicCaseId(), f.legal(), new ClassifyBasisRequest(Route.COURT, "Evidence")));
            assertEquals(ErrorCode.BASIS_DOSSIER_INVALID_STATE, error.getErrorCode());
            status.setRollbackOnly();
        });
        assertEquals(0, count("legal_basis_dossiers", "verification_case_id = ?", f.caseId()));
    }

    @Test
    void concurrentClassificationsCreateExactlyOneDossierAndOneAudit() throws Exception {
        var f = fixture(true);
        CountDownLatch start = new CountDownLatch(1);
        Callable<Boolean> classify = () -> {
            assertTrue(start.await(10, TimeUnit.SECONDS));
            try {
                service().classify(f.publicCaseId(), f.legal(), new ClassifyBasisRequest(Route.COURT, "Evidence"));
                return true;
            } catch (BusinessException ex) { return false; }
        };
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(classify);
            var second = workers.submit(classify);
            start.countDown();
            assertNotEquals(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
        }
        assertEquals(1, count("legal_basis_dossiers", "verification_case_id = ?", f.caseId()));
        assertEquals(1, count("audit_logs", "vault_id = ? AND action = 'LEGAL_BASIS_CLASSIFIED'", f.vaultId()));
    }

    @Test
    void auditFailureRollsBackDossierAndVaultTransition() {
        var f = fixture(true);
        jdbc.execute("CREATE TRIGGER dbo.TR_test_reject_classification_audit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE action = 'LEGAL_BASIS_CLASSIFIED') THROW 51000, 'Injected audit failure', 1; END");
        try {
            assertThrows(RuntimeException.class, () -> service().classify(f.publicCaseId(), f.legal(), new ClassifyBasisRequest(Route.COURT, "Evidence")));
            assertEquals(0, count("legal_basis_dossiers", "verification_case_id = ?", f.caseId()));
            assertEquals("WILL_VERIFICATION", jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id = ?", String.class, f.vaultId()));
        } finally { jdbc.execute("DROP TRIGGER dbo.TR_test_reject_classification_audit"); }
    }
}
