package com.legacyvault.verification;
import com.legacyvault.verification.service.*;
import com.legacyvault.verification.dto.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class HandoverArchiveSqlServerTest extends HandoverCompletionSqlSupport {
 private Ready completed(boolean receipt){
  var r=ready(true);
  context.getBean(BeneficiaryReconciliationService.class).confirm(r.f().publicCaseId(),r.session(),
   r.recipient(),new ConfirmBeneficiaryRequest("REF"),r.f().legal());
  context.getBean(HandoverCloseService.class).close(r.f().publicCaseId(),r.session(),r.f().legal());
  if(receipt)context.getBean(HandoverReceiptService.class).create(r.f().publicCaseId(),r.session(),
   new CreateHandoverReceiptRequest(r.recipient(),List.of(r.asset()),null),r.f().legal());
  return r;
 }
 private HandoverArchiveResponse archive(Ready r){return context.getBean(HandoverArchiveService.class)
  .archive(r.f().publicCaseId(),r.session(),r.f().legal());}
 @Test void archiveRequiresReceiptCoverageAndPreservesHistory(){
  var noReceipt=completed(false);assertThrows(com.legacyvault.common.error.BusinessException.class,()->archive(noReceipt));
  var r=completed(true);var result=archive(r);
  assertEquals("ARCHIVED",result.vaultStatus());assertEquals("CLOSED",result.caseStatus());assertEquals(result,archive(r));
  assertEquals(1,context.getBean(HandoverReceiptService.class).list(r.f().publicCaseId(),r.session(),r.f().legal()).size());
  assertEquals(com.legacyvault.verification.entity.HandoverSessionStatus.COMPLETED,
   context.getBean(HandoverSessionService.class).get(r.f().publicCaseId(),r.session(),r.f().legal()).status());
  assertTrue(context.getBean(HandoverCompletionService.class).get(r.f().publicCaseId(),r.session(),r.f().legal()).ready());
  assertEquals(1,context.getBean(BeneficiaryReconciliationService.class).list(r.f().publicCaseId(),r.session(),r.f().legal()).size());
  assertTrue(context.getBean(AssetCompletionService.class).get(r.f().publicCaseId(),r.session(),r.f().legal()).complete());
  var stranger=new com.legacyvault.common.security.CustomUserPrincipal(r.f().userId()+999999,UUID.randomUUID(),"stranger@example.test");
  assertThrows(com.legacyvault.common.error.BusinessException.class,()->context.getBean(HandoverCompletionService.class)
   .get(r.f().publicCaseId(),r.session(),stranger));
  assertThrows(com.legacyvault.common.error.BusinessException.class,()->context.getBean(HandoverCompletionService.class)
   .get(r.f().publicCaseId(),UUID.randomUUID(),r.f().legal()));
  assertThrows(com.legacyvault.common.error.BusinessException.class,()->context.getBean(BeneficiaryReconciliationService.class)
   .confirm(r.f().publicCaseId(),r.session(),r.recipient(),new ConfirmBeneficiaryRequest("REF"),r.f().legal()));
  assertThrows(RuntimeException.class,()->jdbc.update("INSERT dbo.vaults(owner_user_id,vault_name) VALUES (?,'Second')",r.f().userId()));
 }
 @Test void archivedRowsCannotMutateThroughAnyRepresentativePath(){
  var r=completed(true);archive(r);
  for(String sql:List.of(
   "UPDATE dbo.vaults SET status='ACTIVE' WHERE vault_id="+r.f().vaultId(),
   "UPDATE dbo.assets SET title='changed' WHERE vault_id="+r.f().vaultId(),
   "UPDATE dbo.beneficiaries SET full_name='changed' WHERE vault_id="+r.f().vaultId(),
   "UPDATE dbo.verification_cases SET status='OPEN' WHERE verification_case_id="+r.f().caseId(),
   "UPDATE dbo.legal_basis_dossiers SET route='ON_HOLD' WHERE verification_case_id="+r.f().caseId(),
   "UPDATE dbo.handover_items SET status='VERIFIED_BY_BENEFICIARY' WHERE handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE verification_case_id="+r.f().caseId()+")")){
   assertThrows(org.springframework.dao.DataAccessException.class,()->jdbc.update(sql));
  }
 }
 @Test void auditFailureRollsBackBothArchiveAndCaseClose(){
  var r=completed(true);
  jdbc.execute("CREATE TRIGGER dbo.TR_TestArchiveAudit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='VAULT_HANDOVER_ARCHIVED') THROW 51993,'test failure',1; END");
  try{assertThrows(RuntimeException.class,()->archive(r));}finally{jdbc.execute("DROP TRIGGER dbo.TR_TestArchiveAudit");}
  assertEquals(1,count("vaults","vault_id=? AND status='HANDOVER_IN_PROGRESS'",r.f().vaultId()));
  assertEquals(1,count("verification_cases","verification_case_id=? AND status='OPEN'",r.f().caseId()));
 }
 @Test void concurrentArchiveCommitsOnlyOnce()throws Exception{
  var r=completed(true);var barrier=new CyclicBarrier(2);
  try(var pool=Executors.newFixedThreadPool(2)){
   Callable<HandoverArchiveResponse> task=()->{barrier.await();return archive(r);};
   var futures=pool.invokeAll(List.of(task,task));assertEquals(futures.get(0).get(),futures.get(1).get());
  }
  assertEquals(1,count("audit_logs","vault_id=? AND action='VAULT_HANDOVER_ARCHIVED'",r.f().vaultId()));
 }
}
