package com.legacyvault.verification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class CourtDecisionSqlServerTest extends LegalBasisSqlServerSupport {
    private CourtDecisionService service() { return context.getBean(CourtDecisionService.class); }

    private Fixture court(int versionCount, boolean forward) {
        var f = fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(), f.legal(),
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT, "Legal determined dispute"));
        for (int i = 0; i < versionCount; i++) intakeVersion(f, "COURT_JUDGMENT");
        if (forward) context.getBean(BasisForwardService.class).forward(f.publicCaseId(), versionCount, f.legal());
        return f;
    }

    private void requireCourtGate(Fixture f) {
        tx.executeWithoutResult(status -> {
            var locked = context.getBean(LegalBasisCaseAccess.class).lock(f.publicCaseId());
            context.getBean(CourtRouteGuard.class).requireValidDecision(locked.dossier());
        });
    }

    @Test
    void validLegalAssessmentReferencesForwardedVersionWithoutUnlocking() {
        var f = court(1, true);
        var error = assertThrows(BusinessException.class, () -> requireCourtGate(f));
        assertEquals(ErrorCode.COURT_DECISION_REQUIRED, error.getErrorCode());
        var response = service().record(f.publicCaseId(), f.legal(), new CourtDecisionRequest(1, CourtDecisionRequest.Result.VALID, "Private Legal assessment"));
        assertEquals(f.legal().publicId(), response.reviewedBy());
        assertEquals(1, response.version());
        assertEquals(64, response.sha256().length());
        requireCourtGate(f);
        assertEquals("LEGAL_BASIS_VERIFICATION", jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id = ?", String.class, f.vaultId()));
        assertEquals(1, service().history(f.publicCaseId()).size());
        String details = jdbc.queryForObject("SELECT details FROM dbo.audit_logs WHERE vault_id = ? AND action = 'COURT_DECISION_RECORDED'", String.class, f.vaultId());
        assertEquals("ST-20", jdbc.queryForObject("SELECT step_id FROM dbo.audit_logs WHERE vault_id = ? AND action = 'COURT_DECISION_RECORDED'", String.class, f.vaultId()));
        assertEquals("LV-COURT-001", jdbc.queryForObject("SELECT rule_id FROM dbo.audit_logs WHERE vault_id = ? AND action = 'COURT_DECISION_RECORDED'", String.class, f.vaultId()));
        assertFalse(details.contains("Private Legal assessment"));
        assertFalse(details.contains("Document fixture"));
    }

    @Test
    void latestInvalidOrInconclusiveAssessmentBlocksEvenAfterValid() {
        var f = court(1, true);
        for (var result : CourtDecisionRequest.Result.values()) {
            service().record(f.publicCaseId(), f.legal(), new CourtDecisionRequest(1, result, "Legal decision"));
            if (result == CourtDecisionRequest.Result.VALID) requireCourtGate(f);
            else assertThrows(BusinessException.class, () -> requireCourtGate(f));
        }
        assertEquals(3, service().history(f.publicCaseId()).size());
        assertEquals("INCONCLUSIVE", service().history(f.publicCaseId()).getFirst().result());
    }

    @Test
    void onlyCurrentForwardedVersionCanBeReviewed() {
        var f = court(2, true);
        var error = assertThrows(BusinessException.class, () -> service().record(f.publicCaseId(), f.legal(),
                new CourtDecisionRequest(1, CourtDecisionRequest.Result.VALID, "Old version")));
        assertEquals(ErrorCode.BASIS_VERSION_STALE, error.getErrorCode());
        service().record(f.publicCaseId(), f.legal(), new CourtDecisionRequest(2, CourtDecisionRequest.Result.VALID, "Current version"));
        requireCourtGate(f);
    }

    @Test
    void unforwardedCourtDocumentCannotBeApproved() {
        var f = court(1, false);
        assertThrows(BusinessException.class, () -> service().record(f.publicCaseId(), f.legal(),
                new CourtDecisionRequest(1, CourtDecisionRequest.Result.VALID, "Not yet forwarded")));
        assertEquals(0, service().history(f.publicCaseId()).size());
    }

    @Test
    void cancelledCaseAndNotarialRouteCannotReceiveCourtAssessment() {
        var f = court(1, true);
        jdbc.update("UPDATE dbo.verification_cases SET status = 'CANCELLED', closed_at = SYSUTCDATETIME() WHERE verification_case_id = ?", f.caseId());
        assertThrows(BusinessException.class, () -> service().record(f.publicCaseId(), f.legal(),
                new CourtDecisionRequest(1, CourtDecisionRequest.Result.VALID, "Cancelled")));
        var notarial = fixture(true);
        context.getBean(BasisClassificationService.class).classify(notarial.publicCaseId(), notarial.legal(),
                new ClassifyBasisRequest(ClassifyBasisRequest.Route.NOTARIAL, "No dispute"));
        assertThrows(BusinessException.class, () -> service().record(notarial.publicCaseId(), notarial.legal(),
                new CourtDecisionRequest(1, CourtDecisionRequest.Result.VALID, "Wrong route")));
    }

    @Test
    void auditFailureRollsBackAssessmentAndDecisionHistoryIsAppendOnly() {
        var f = court(1, true);
        jdbc.execute("CREATE TRIGGER dbo.TR_test_court_audit_failure ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE action = 'COURT_DECISION_RECORDED') THROW 51000, 'Injected court audit failure', 1; END");
        try {
            assertThrows(RuntimeException.class, () -> service().record(f.publicCaseId(), f.legal(),
                    new CourtDecisionRequest(1, CourtDecisionRequest.Result.VALID, "Must roll back")));
            assertEquals(0, service().history(f.publicCaseId()).size());
            assertThrows(BusinessException.class, () -> requireCourtGate(f));
        } finally { jdbc.execute("DROP TRIGGER dbo.TR_test_court_audit_failure"); }
        var recorded = service().record(f.publicCaseId(), f.legal(), new CourtDecisionRequest(1, CourtDecisionRequest.Result.VALID, "Preserved assessment"));
        assertThrows(RuntimeException.class, () -> jdbc.update("UPDATE dbo.court_decisions SET result = 'INVALID' WHERE public_id = ?", recorded.id().toString()));
        assertThrows(RuntimeException.class, () -> jdbc.update("DELETE dbo.court_decisions WHERE public_id = ?", recorded.id().toString()));
        assertEquals("VALID", service().history(f.publicCaseId()).getFirst().result());
    }
}
