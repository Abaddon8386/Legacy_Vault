package com.legacyvault.verification;

import com.legacyvault.common.error.*;
import com.legacyvault.subscription.service.OwnerQuotaService;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.service.BasisClassificationService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class LegalEvidenceQuotaSqlServerTest extends LegalBasisSqlServerSupport {
    private Fixture ready() {
        var f=fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(),f.legal(),
            new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT,"Quota fixture"));
        return f;
    }
    @Test
    void evidenceBytesBelongToCaseAndPreserveHistoryAtLimit() {
        var f=ready();
        intakeVersion(f,"COURT_JUDGMENT");
        var quotas=context.getBean(OwnerQuotaService.class);
        long before=quotas.current(f.userId()).usage().storageBytes();
        jdbc.update("UPDATE dbo.legal_basis_dossier_versions SET file_size_bytes=104857600 WHERE legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?)",f.caseId());
        var error=assertThrows(BusinessException.class,()->intakeVersion(f,"COURT_JUDGMENT"));
        assertEquals(ErrorCode.CASE_EVIDENCE_QUOTA_EXCEEDED,error.getErrorCode());
        assertEquals(1,count("legal_basis_dossier_versions","legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?)",f.caseId()));
        assertEquals(before,quotas.current(f.userId()).usage().storageBytes());
        var other=ready();
        assertNotNull(intakeVersion(other,"COURT_JUDGMENT"));
        assertEquals(1,count("audit_logs","vault_id=? AND action='LEGAL_BASIS_RECEIVED'",f.vaultId()));
    }
    @Test
    void fiftyRetainedVersionsAreAllowedAndFiftyFirstIsRejected() {
        var f=ready();
        for(int i=0;i<50;i++) intakeVersion(f,"COURT_JUDGMENT");
        assertEquals(ErrorCode.CASE_EVIDENCE_QUOTA_EXCEEDED,
            assertThrows(BusinessException.class,()->intakeVersion(f,"COURT_JUDGMENT")).getErrorCode());
        assertEquals(50,count("audit_logs","vault_id=? AND action='LEGAL_BASIS_RECEIVED'",f.vaultId()));
    }
    @Test
    void evidenceAuditRollbackDoesNotConsumeCaseQuota() {
        var f=ready();
        jdbc.execute("CREATE TRIGGER dbo.TR_ps77_evidence_audit_failure ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='LEGAL_BASIS_RECEIVED') THROW 51803,'Synthetic evidence audit failure',1; END");
        try {
            assertThrows(RuntimeException.class,()->intakeVersion(f,"COURT_JUDGMENT"));
            assertEquals(0,count("legal_basis_dossier_versions","legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?)",f.caseId()));
        } finally {jdbc.execute("DROP TRIGGER dbo.TR_ps77_evidence_audit_failure");}
        assertNotNull(intakeVersion(f,"COURT_JUDGMENT"));
    }
    @Test
    void concurrentIntakesCannotBothConsumeLastAvailableBytes() throws Exception {
        var f=ready();
        intakeVersion(f,"COURT_JUDGMENT");
        long fileBytes=jdbc.queryForObject("SELECT file_size_bytes FROM dbo.legal_basis_dossier_versions WHERE legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?)",Long.class,f.caseId());
        jdbc.update("UPDATE dbo.legal_basis_dossier_versions SET file_size_bytes=? WHERE legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?)",104857600-fileBytes,f.caseId());
        var locked=new java.util.concurrent.CountDownLatch(1);
        var release=new java.util.concurrent.CountDownLatch(1);
        var workers=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var first=workers.submit(()->tx.execute(status->{
                var response=intakeVersion(f,"COURT_JUDGMENT");
                locked.countDown();
                try {if(!release.await(15,java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Timeout");}
                catch(InterruptedException ex){Thread.currentThread().interrupt();throw new IllegalStateException(ex);}
                return response;
            }));
            assertTrue(locked.await(10,java.util.concurrent.TimeUnit.SECONDS));
            var second=workers.submit(()->assertThrows(BusinessException.class,()->intakeVersion(f,"COURT_JUDGMENT")).getErrorCode());
            assertThrows(java.util.concurrent.TimeoutException.class,()->second.get(200,java.util.concurrent.TimeUnit.MILLISECONDS));
            release.countDown();first.get(15,java.util.concurrent.TimeUnit.SECONDS);
            assertEquals(ErrorCode.CASE_EVIDENCE_QUOTA_EXCEEDED,second.get(15,java.util.concurrent.TimeUnit.SECONDS));
            assertEquals(2,count("audit_logs","vault_id=? AND action='LEGAL_BASIS_RECEIVED'",f.vaultId()));
        } finally {
            release.countDown();workers.shutdownNow();assertTrue(workers.awaitTermination(25,java.util.concurrent.TimeUnit.SECONDS));
        }
    }

}
