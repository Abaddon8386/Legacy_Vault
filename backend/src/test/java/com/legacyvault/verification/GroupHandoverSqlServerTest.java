package com.legacyvault.verification;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class GroupHandoverSqlServerTest extends HandoverCompletionSqlSupport {
 void insert(Fixture f,long session,UUID key,long revision){
  jdbc.update("INSERT dbo.handover_group_events(public_id,case_id,session_id,actor_user_id,operation,idempotency_key,payload_hash,revision,state_json,present_json,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
   UUID.randomUUID().toString(),f.caseId(),session,f.userId(),"ATTENDANCE",key.toString(),HASH,revision,"{}","[]","Missing");
 }
 long session(Fixture f){
  return jdbc.queryForObject("INSERT dbo.handover_sessions(verification_case_id,staff_user_id,status) OUTPUT inserted.handover_session_id VALUES(?,?,'OPEN')",Long.class,f.caseId(),f.userId());
 }
 @Test void migrationCreatesEventTableAndRollbackLeavesNoState(){
  var f=fixture(false);long s=session(f);
  tx.executeWithoutResult(status->{insert(f,s,UUID.randomUUID(),1);status.setRollbackOnly();});
  assertThat(count("handover_group_events","case_id=?",f.caseId())).isZero();
 }
 @Test void duplicateRetryKeyCannotCreateSecondEvent(){
  var f=fixture(false);long s=session(f);var key=UUID.randomUUID();
  insert(f,s,key,1);
  assertThatThrownBy(()->insert(f,s,key,2)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  assertThat(count("handover_group_events","case_id=?",f.caseId())).isEqualTo(1);
 }
 @Test void sharedFixtureHonorsWholeGroupSuspensionAndLegalReopen() {
  var r=ready(false);
  var group=context.getBean(com.legacyvault.verification.group.GroupHandoverService.class);
  var f=r.f();var actor=f.legal();
  var v=group.view(f.publicCaseId(),r.session(),actor,false);
  group.mutate(f.publicCaseId(),r.session(),null,UUID.randomUUID(),"ATTENDANCE",
    new com.legacyvault.verification.group.GroupHandoverService.Body(v.state().revision(),java.util.Set.of(),"Missing"),actor,false);
  assertThatThrownBy(()->deliver(r)).isInstanceOfSatisfying(com.legacyvault.common.error.BusinessException.class,
    e->assertThat(e.getErrorCode()).isEqualTo(com.legacyvault.common.error.ErrorCode.GROUP_HANDOVER_BLOCKED));
  recordFullAttendance(r);
  v=group.view(f.publicCaseId(),r.session(),actor,false);
  assertThat(v.state().status()).isEqualTo("SUSPENDED");
  var request=group.mutate(f.publicCaseId(),r.session(),null,UUID.randomUUID(),"REQUEST",
    new com.legacyvault.verification.group.GroupHandoverService.Body(v.state().revision(),null,"All present"),actor,false);
  group.mutate(f.publicCaseId(),r.session(),request.state().requestId(),UUID.randomUUID(),"APPROVE",
    new com.legacyvault.verification.group.GroupHandoverService.Body(request.state().revision(),null,"Reviewed"),actor,true);
  deliver(r);
  assertThat(count("handover_items","handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)",r.session().toString())).isEqualTo(1);
 }}
