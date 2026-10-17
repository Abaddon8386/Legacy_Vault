package com.legacyvault.verification;

import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.service.BasisClassificationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

/** Pending subscription proposals must never block the approved PS-41 intake flow. */
@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class LegalEvidenceQuotaSqlServerTest extends LegalBasisSqlServerSupport {
    private Fixture ready() {
        var f=fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(),f.legal(),
            new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT,"Regression fixture"));
        return f;
    }
    @Test
    void proposedCaseByteQuotaDoesNotBlockApprovedIntake() {
        var f=ready();
        intakeVersion(f,"COURT_JUDGMENT");
        jdbc.update("UPDATE dbo.legal_basis_dossier_versions SET file_size_bytes=104857600 WHERE legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?)",f.caseId());
        assertNotNull(intakeVersion(f,"COURT_JUDGMENT"));
        assertEquals(2,count("audit_logs","vault_id=? AND action='LEGAL_BASIS_RECEIVED'",f.vaultId()));
    }
    @Test
    void proposedFiftyVersionQuotaDoesNotBlockApprovedIntake() {
        var f=ready();
        for(int i=0;i<51;i++) intakeVersion(f,"COURT_JUDGMENT");
        assertEquals(51,count("audit_logs","vault_id=? AND action='LEGAL_BASIS_RECEIVED'",f.vaultId()));
    }
}
