package com.legacyvault.verification;
import com.legacyvault.audit.*;
import com.legacyvault.verification.service.WorkflowNotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
class WorkflowNotificationServiceTest {
 private AuditService.RecordedEvent event(AuditAction action){return new AuditService.RecordedEvent(new AuditEvent(action,AuditActorType.USER,2L,3L,"DEATH_DOCUMENT_RECORD",4L,null,null,null,Map.of(),null,null),77L);}
 @Test void successfulUploadCreatesAPersistedCaseNotification(){
  var jdbc=mock(JdbcTemplate.class);when(jdbc.update(anyString(),any(Object[].class))).thenReturn(1);var service=new WorkflowNotificationService(jdbc);
  service.capture(event(AuditAction.INTAKE_ATTACHMENT_UPLOADED));verify(jdbc).update(contains("INSERT INTO dbo.workflow_notifications"),eq(77L),eq("INTAKE_ATTACHMENT_UPLOADED"),isNull(),eq(3L));
 }
 @Test void absentNotificationInsertPropagatesFailureInsteadOfAcknowledgingDelivery(){var service=new WorkflowNotificationService(mock(JdbcTemplate.class));assertThatThrownBy(()->service.capture(event(AuditAction.DEATH_DOCUMENT_RECORDED))).isInstanceOf(IllegalStateException.class);}
 @Test void unrelatedActionsDoNotCreateWorkflowNotices(){var jdbc=mock(JdbcTemplate.class);new WorkflowNotificationService(jdbc).capture(event(AuditAction.AUTH_LOGIN_SUCCEEDED));verifyNoInteractions(jdbc);}
}
