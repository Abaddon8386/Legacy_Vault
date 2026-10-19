package com.legacyvault.verification;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class BeneficiaryReconciliationSqlServerTest extends HandoverCompletionSqlSupport {
    private BeneficiaryReconciliationService service(){return context.getBean(BeneficiaryReconciliationService.class);}
    private BeneficiaryConfirmationResponse confirm(Ready r,String ref){
        return service().confirm(r.f().publicCaseId(),r.session(),r.recipient(),new ConfirmBeneficiaryRequest(ref),r.f().legal());
    }
    @Test void deliveryDoesNotAutoConfirmAndConfirmationRequiresDelivery(){
        var r=ready(false);
        assertEquals("PENDING",service().list(r.f().publicCaseId(),r.session(),r.f().legal()).getFirst().status());
        assertEquals(ErrorCode.HANDOVER_CONFIRMATION_PENDING_DELIVERY,
            assertThrows(BusinessException.class,()->confirm(r,"REF-1")).getErrorCode());
        deliver(r);
        assertEquals("PENDING",service().list(r.f().publicCaseId(),r.session(),r.f().legal()).getFirst().status());
        var response=confirm(r,"REF-1");
        assertEquals("CONFIRMED",response.status());assertEquals(r.f().legal().publicId(),response.confirmedBy());
        assertNotNull(response.confirmedAt());
    }
    @Test void retryPreservesEvidenceAndDifferentReferenceConflicts(){
        var r=ready(true);var a=confirm(r,"REF-2");var b=confirm(r,"REF-2");
        assertEquals(a,b);
        assertEquals(ErrorCode.HANDOVER_CONFIRMATION_CONFLICT,
            assertThrows(BusinessException.class,()->confirm(r,"OTHER")).getErrorCode());
        assertEquals(1,count("audit_logs","vault_id=? AND action='BENEFICIARY_HANDOVER_CONFIRMED'",r.f().vaultId()));
    }
    @Test void wrongStaffAndOutsideScopeCannotConfirm(){
        var r=ready(true);
        var other=new CustomUserPrincipal(r.f().userId()+999,UUID.randomUUID(),"other@example.test");
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND,assertThrows(BusinessException.class,()->
            service().confirm(r.f().publicCaseId(),r.session(),r.recipient(),new ConfirmBeneficiaryRequest("REF"),other)).getErrorCode());
        assertEquals(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE,assertThrows(BusinessException.class,()->
            service().confirm(r.f().publicCaseId(),r.session(),UUID.randomUUID(),new ConfirmBeneficiaryRequest("REF"),r.f().legal())).getErrorCode());
    }
    @Test void auditFailureRollsBackAndReferenceNeverEntersAudit(){
        var r=ready(true);
        jdbc.execute("CREATE TRIGGER dbo.TR_TestConfirmationAudit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='BENEFICIARY_HANDOVER_CONFIRMED') THROW 51991,'test failure',1; END");
        try{assertThrows(RuntimeException.class,()->confirm(r,"PRIVATE-REFERENCE"));}
        finally{jdbc.execute("DROP TRIGGER dbo.TR_TestConfirmationAudit");}
        assertEquals(0,count("beneficiary_confirmations","handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE verification_case_id=?)",r.f().caseId()));
        confirm(r,"PRIVATE-REFERENCE");
        assertEquals(0,count("audit_logs","vault_id=? AND details LIKE '%PRIVATE-REFERENCE%'",r.f().vaultId()));
    }
    @Test void concurrentRetryCreatesOneEvidenceRowAndOneAudit()throws Exception{
        var r=ready(true);var barrier=new CyclicBarrier(2);
        try(var pool=Executors.newFixedThreadPool(2)){
            Callable<BeneficiaryConfirmationResponse> task=()->{barrier.await();return confirm(r,"SAME");};
            var futures=pool.invokeAll(List.of(task,task));
            assertEquals(futures.get(0).get(),futures.get(1).get());
        }
        assertEquals(1,count("audit_logs","vault_id=? AND action='BENEFICIARY_HANDOVER_CONFIRMED'",r.f().vaultId()));
    }
    @Test void holdAndCancelledSessionRejectConfirmation(){
        var r=ready(true);
        jdbc.update("UPDATE dbo.handover_sessions SET status='CANCELLED',closed_at=SYSUTCDATETIME() WHERE public_id=?",r.session().toString());
        assertEquals(ErrorCode.HANDOVER_SESSION_INVALID_STATE,assertThrows(BusinessException.class,()->confirm(r,"REF")).getErrorCode());
        var held=ready(true);jdbc.update("UPDATE dbo.vaults SET status='ON_HOLD' WHERE vault_id=?",held.f().vaultId());
        assertEquals(ErrorCode.LEGAL_WORKFLOW_ON_HOLD,assertThrows(BusinessException.class,()->confirm(held,"REF")).getErrorCode());
    }
}
