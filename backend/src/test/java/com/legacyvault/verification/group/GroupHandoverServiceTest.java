package com.legacyvault.verification.group;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.service.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.entity.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
class GroupHandoverServiceTest {
 final JdbcTemplate jdbc=mock(JdbcTemplate.class);
 final HandoverCompletionAccess completion=mock(HandoverCompletionAccess.class);
 final LegalWorkflowGuard legal=mock(LegalWorkflowGuard.class);
 final HandoverSessionRepository sessions=mock(HandoverSessionRepository.class);
 final LegalBasisReviewHistoryRepository history=mock(LegalBasisReviewHistoryRepository.class);
 final AuditService audit=mock(AuditService.class);
 final GroupHandoverService service=new GroupHandoverService(jdbc,new ObjectMapper(),completion,legal,sessions,history,audit,mock(LegalBasisLockedState.class));
 final UUID caseId=UUID.randomUUID(),sessionId=UUID.randomUUID(),recipient=UUID.randomUUID();
 final CustomUserPrincipal actor=new CustomUserPrincipal(7L,UUID.randomUUID(),"staff@test.local");
 void fixture(){
  var s=mock(HandoverCompletionAccess.Snapshot.class,RETURNS_DEEP_STUBS);
  when(completion.lock(caseId,sessionId,actor,true)).thenReturn(s);
  when(s.locked().verificationCase().getVerificationCaseId()).thenReturn(1L);
  when(s.locked().verificationCase().getAssignedStaffUserId()).thenReturn(7L);
  when(s.locked().dossier().getLegalBasisDossierId()).thenReturn(2L);
  when(s.locked().vault().getVaultId()).thenReturn(3L);
  when(s.session().getPublicId()).thenReturn(sessionId);
  when(s.session().getId()).thenReturn(4L);
  when(s.session().getStatus()).thenReturn(HandoverSessionStatus.OPEN);
  when(s.version().sha256()).thenReturn("a".repeat(64));
  when(s.scopeHash()).thenReturn("b".repeat(64));
  when(s.rows()).thenReturn(List.of(new ReceiptAllocationRow(1,10L,20L,UUID.randomUUID(),30L,recipient,"VERIFIED_AT_COUNTER","APPROVED","all")));
  var decision=mock(LegalBasisReviewHistory.class);
  when(decision.getPublicId()).thenReturn(UUID.randomUUID());
  when(history.findFirstByDossierIdAndReviewStatusInOrderByIdDesc(eq(2L),anyList())).thenReturn(Optional.of(decision));
 }
 @Test void oldClientWithoutAttendanceIsBlocked(){fixture();assertThatThrownBy(()->service.requireReady(caseId,sessionId,actor)).isInstanceOf(BusinessException.class);}
 @Test void missingReportStoresSuspensionAndAuditTogether(){
  fixture();
  var r=service.mutate(caseId,sessionId,null,UUID.randomUUID(),"ATTENDANCE",new GroupHandoverService.Body(0L,Set.of(),"Missing"),actor,false);
  assertThat(r.state().status()).isEqualTo("SUSPENDED");assertThat(r.notification()).isNull();
  verify(jdbc).update(anyString(),any(Object[].class));verify(audit).record(any());
 }
 @Test void auditFailureEscapesTransactionalMethod(){
  fixture();doThrow(new IllegalStateException("audit failed")).when(audit).record(any());
  assertThatThrownBy(()->service.mutate(caseId,sessionId,null,UUID.randomUUID(),"ATTENDANCE",
    new GroupHandoverService.Body(0L,Set.of(),"Missing"),actor,false)).isInstanceOf(IllegalStateException.class);
 }
 @Test void staleRevisionWritesNothing(){
  fixture();
  assertThatThrownBy(()->service.mutate(caseId,sessionId,null,UUID.randomUUID(),"ATTENDANCE",
    new GroupHandoverService.Body(5L,Set.of(),"Missing"),actor,false)).isInstanceOf(BusinessException.class);
  verify(jdbc,never()).update(anyString(),any(Object[].class));verifyNoInteractions(audit);
 }
 @Test void committedRetryReturnsOriginalReceiptAndDoesNotWriteAgain() throws Exception {
  fixture();var key=UUID.randomUUID();var body=new GroupHandoverService.Body(0L,Set.of(),"Missing");
  var first=service.mutate(caseId,sessionId,null,key,"ATTENDANCE",body,actor,false);
  var capture=org.mockito.ArgumentCaptor.forClass(Object[].class);
  verify(jdbc).update(anyString(),capture.capture());
  var args=capture.getValue();
  when(jdbc.queryForList(anyString(),eq(1L),eq(7L),eq(key.toString()))).thenReturn(List.of(Map.of(
    "public_id",first.eventId().toString(),"payload_hash",args[6],"state_json",args[8])));
  clearInvocations(jdbc,audit);
  var second=service.mutate(caseId,sessionId,null,key,"ATTENDANCE",body,actor,false);
  assertThat(second).isEqualTo(first);
  verify(jdbc,never()).update(anyString(),any(Object[].class));verifyNoInteractions(audit);
 }}
