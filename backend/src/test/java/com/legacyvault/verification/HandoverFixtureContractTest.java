package com.legacyvault.verification;
import com.legacyvault.verification.group.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.ConfigurableApplicationContext;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;

class HandoverFixtureContractTest {
 @Test void attendanceSetupUsesServerRequiredRecipientsAndCurrentRevision() {
  var previous=LegalBasisSqlServerSupport.context;
  try {
   var app=mock(ConfigurableApplicationContext.class);
   var group=mock(GroupHandoverService.class);
   LegalBasisSqlServerSupport.context=app;
   when(app.getBean(GroupHandoverService.class)).thenReturn(group);
   var actor=new CustomUserPrincipal(1L,UUID.randomUUID(),"fixture@example.test");
   var caseId=UUID.randomUUID();var sessionId=UUID.randomUUID();
   var recipients=Set.of(UUID.randomUUID(),UUID.randomUUID());
   var f=new LegalBasisSqlServerSupport.Fixture(1L,2L,3L,caseId,actor);
   var state=new GroupState("SUSPENDED",4L,UUID.randomUUID(),"hash",false,null);
   when(group.view(caseId,sessionId,actor,false)).thenReturn(new GroupHandoverService.View(state,"hash",recipients,false));
   HandoverCompletionSqlSupport.recordFullAttendance(f,sessionId);
   var body=org.mockito.ArgumentCaptor.forClass(GroupHandoverService.Body.class);
   verify(group).mutate(eq(caseId),eq(sessionId),isNull(),any(UUID.class),eq("ATTENDANCE"),body.capture(),eq(actor),eq(false));
   assertThat(body.getValue().expectedRevision()).isEqualTo(4);
   assertThat(body.getValue().presentRecipientIds()).containsExactlyInAnyOrderElementsOf(recipients);
   // This helper submits attendance only: it cannot issue a Legal reopen decision or manipulate gate rows.
   verify(group).view(caseId,sessionId,actor,false);
   verifyNoMoreInteractions(group);
  } finally {LegalBasisSqlServerSupport.context=previous;}
 }
}
