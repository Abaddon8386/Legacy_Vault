package com.legacyvault.verification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.service.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CourtOnlySqlServerTest extends HandoverCompletionSqlSupport {
    @Test void notarialWithoutDeedIsReadableButCannotApproveUnlockOrDeliver() {
        var r=ready(false);var f=r.f();
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET route='NOTARIAL' WHERE verification_case_id=?",f.caseId());
        jdbc.update("UPDATE dbo.vaults SET status='LEGAL_BASIS_VERIFICATION' WHERE vault_id=?",f.vaultId());
        int audits=count("audit_logs","vault_id=?",f.vaultId());
        var read=context.getBean(LegalReadService.class).context(f.legal(),f.publicCaseId());
        assertEquals("NOTARIAL",read.basisDossier().route());
        assertFalse(read.capabilities().approval().allowed());assertFalse(read.capabilities().unlock().allowed());
        var s=read.snapshot();
        assertThrows(BusinessException.class,()->context.getBean(LegalApprovalService.class).decide(f.publicCaseId(),f.legal(),new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE,1,s.sha256Hash(),s.allocationHash(),"Legacy bypass")));
        assertThrows(BusinessException.class,()->context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(),f.legal()));
        jdbc.update("UPDATE dbo.vaults SET status='UNLOCKED' WHERE vault_id=?",f.vaultId());
        assertThrows(BusinessException.class,()->deliver(r));
        assertEquals(audits,count("audit_logs","vault_id=?",f.vaultId()));
        assertEquals("NOTARIAL",context.getBean(LegalReadService.class).context(f.legal(),f.publicCaseId()).basisDossier().route());
    }
    @Test void invalidCourtAssessmentBlocksFinalApprovalWithoutChangingAllocationsOrAudit() {
        var r=ready(false);var f=r.f();
        jdbc.update("UPDATE dbo.vaults SET status='LEGAL_BASIS_VERIFICATION' WHERE vault_id=?",f.vaultId());
        context.getBean(CourtDecisionService.class).record(f.publicCaseId(),f.legal(),new CourtDecisionRequest(1,CourtDecisionRequest.Result.INVALID,"Fixture invalid court"));
        int audits=count("audit_logs","vault_id=?",f.vaultId());
        var s=context.getBean(LegalReadService.class).context(f.legal(),f.publicCaseId()).snapshot();
        assertThrows(BusinessException.class,()->context.getBean(LegalApprovalService.class).decide(f.publicCaseId(),f.legal(),new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE,1,s.sha256Hash(),s.allocationHash(),"Bypass")));
        assertThrows(BusinessException.class,()->context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(),f.legal()));
        assertEquals(audits,count("audit_logs","vault_id=?",f.vaultId()));
    }
}
