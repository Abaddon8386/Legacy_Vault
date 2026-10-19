package com.legacyvault.verification;
import com.legacyvault.verification.service.*;
import com.legacyvault.verification.dto.*;
import com.legacyvault.common.error.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class HandoverCloseSqlServerTest extends HandoverCompletionSqlSupport {
 private void confirm(Ready r){context.getBean(BeneficiaryReconciliationService.class).confirm(r.f().publicCaseId(),
  r.session(),r.recipient(),new ConfirmBeneficiaryRequest("REF"),r.f().legal());}
 private HandoverCloseResponse close(Ready r){return context.getBean(HandoverCloseService.class)
  .close(r.f().publicCaseId(),r.session(),r.f().legal());}
 @Test void closeRequiresBothGatesAndThenReceiptRequiresProof(){
  var r=ready(true);assertThrows(BusinessException.class,()->close(r));
  confirm(r);var result=close(r);assertEquals("COMPLETED",result.status());assertEquals(result,close(r));
  var receipt=context.getBean(HandoverReceiptService.class).create(r.f().publicCaseId(),r.session(),
   new CreateHandoverReceiptRequest(r.recipient(),List.of(r.asset()),null),r.f().legal());
  assertEquals("STAFF_ATTESTATION",receipt.confirmationType());
  assertThrows(BusinessException.class,()->confirm(r));
 }
 @Test void auditFailureRollsBackSessionAndProof(){
  var r=ready(true);confirm(r);
  jdbc.execute("CREATE TRIGGER dbo.TR_TestCloseAudit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='HANDOVER_SESSION_COMPLETED') THROW 51992,'test failure',1; END");
  try{assertThrows(RuntimeException.class,()->close(r));}finally{jdbc.execute("DROP TRIGGER dbo.TR_TestCloseAudit");}
  assertEquals(1,count("handover_sessions","public_id=? AND status='OPEN'",r.session().toString()));
  assertEquals(0,count("handover_completion_evidence","handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)",r.session().toString()));
 }
 @Test void concurrentCloseIsIdempotent()throws Exception{
  var r=ready(true);confirm(r);var barrier=new CyclicBarrier(2);
  try(var pool=Executors.newFixedThreadPool(2)){
   Callable<HandoverCloseResponse> task=()->{barrier.await();return close(r);};
   var futures=pool.invokeAll(List.of(task,task));assertEquals(futures.get(0).get(),futures.get(1).get());
  }
  assertEquals(1,count("audit_logs","vault_id=? AND action='HANDOVER_SESSION_COMPLETED'",r.f().vaultId()));
 }
 @Test void concurrentConfirmationAndCloseNeverClosesWithPendingConfirmation()throws Exception{
  var r=ready(true);var barrier=new CyclicBarrier(2);
  try(var pool=Executors.newFixedThreadPool(2)){
   Callable<Boolean> a=()->{barrier.await();confirm(r);return true;};
   Callable<Boolean> b=()->{barrier.await();try{close(r);return true;}catch(BusinessException pending){return false;}};
   for(var f:pool.invokeAll(List.of(a,b)))f.get();
  }
  assertEquals("COMPLETED",close(r).status());
  assertEquals(1,count("audit_logs","vault_id=? AND action='HANDOVER_SESSION_COMPLETED'",r.f().vaultId()));
 }
}
