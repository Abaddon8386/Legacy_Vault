package com.legacyvault.verification;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class GroupHandoverSqlServerTest extends LegalBasisSqlServerSupport {
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
}
