package com.legacyvault.verification;
import com.legacyvault.audit.*;
import com.legacyvault.verification.service.WorkflowNotificationService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.transaction.AfterTransaction;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
/** Opt-in local SQL verification. All fixture rows and audit/notification writes roll back. Not a browser E2E claim. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK)
@Transactional
@EnabledIfEnvironmentVariable(named="LEGACY_WORKFLOW_LOCAL_SQL_TEST",matches="true")
class WorkflowNotificationLocalSqlTest {
 @Autowired JdbcTemplate jdbc;
 @Autowired AuditService audit;
 @Autowired WorkflowNotificationService notifications;
 private UUID caseId;
 private Long user(String kind){return jdbc.queryForObject("INSERT INTO dbo.users(full_name,email,password_hash,status) OUTPUT INSERTED.user_id VALUES(?,?,?,'PENDING')",Long.class,"Workflow SQL fixture "+kind,UUID.randomUUID()+"@workflow-test.invalid","not-a-login-credential");}
 @Test void auditAndNotificationShareTransactionAndStaffReadScope() {
  String url=System.getenv("DB_URL");assertThat(url).isNotNull();assertThat(url.toLowerCase(java.util.Locale.ROOT)).contains("databasename=legacyvault");assertThat(url.toLowerCase(java.util.Locale.ROOT)).containsAnyOf("localhost","127.0.0.1");
  Long owner=user("owner"),staff=user("staff"),other=user("other"),legal=user("legal");
  Long vault=jdbc.queryForObject("INSERT INTO dbo.vaults(owner_user_id,vault_name,status) OUTPUT INSERTED.vault_id VALUES(?,?,'AWAITING_VERIFICATION')",Long.class,owner,"Disposable workflow notification fixture");
  caseId=UUID.randomUUID();
  Long caseKey=jdbc.queryForObject("INSERT INTO dbo.verification_cases(public_id,vault_id,triggered_at,assigned_staff_user_id) OUTPUT INSERTED.verification_case_id VALUES(?,?,SYSUTCDATETIME(),?)",Long.class,caseId.toString(),vault,staff);
  Long document=jdbc.queryForObject("INSERT INTO dbo.death_document_records(verification_case_id,document_type,received_by_user_id) OUTPUT INSERTED.death_document_record_id VALUES(?,'DEATH_CERTIFICATE',?)",Long.class,caseKey,staff);
  audit.record(new AuditEvent(AuditAction.DEATH_DOCUMENT_RECORDED,AuditActorType.USER,staff,vault,"DEATH_DOCUMENT_RECORD",document,null,null,null,Map.of(),null,null));
  var staffNotice=notifications.list(staff,"STAFF").stream().filter(x->x.caseId().equals(caseId)).findFirst().orElseThrow();
  assertThat(staffNotice.read()).isFalse();assertThat(staffNotice.caseNumber()).startsWith("HS-");
  assertThat(notifications.list(other,"STAFF")).noneMatch(x->x.caseId().equals(caseId));
  assertThat(notifications.list(legal,"LEGAL")).anyMatch(x->x.id().equals(staffNotice.id()));
  assertThatThrownBy(()->notifications.read(other,"STAFF",staffNotice.id())).isInstanceOf(com.legacyvault.common.error.BusinessException.class);
  notifications.read(staff,"STAFF",staffNotice.id());notifications.read(staff,"STAFF",staffNotice.id());
  assertThat(notifications.list(staff,"STAFF")).anyMatch(x->x.id().equals(staffNotice.id())&&x.read());
  assertThat(notifications.list(legal,"LEGAL")).anyMatch(x->x.id().equals(staffNotice.id())&&!x.read());
 }
 @AfterTransaction void fixturesDoNotRemain(){if(caseId!=null)assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.verification_cases WHERE public_id=?",Integer.class,caseId.toString())).isZero();}
}
