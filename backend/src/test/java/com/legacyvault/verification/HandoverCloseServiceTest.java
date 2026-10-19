package com.legacyvault.verification;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.service.*;
import com.legacyvault.vault.entity.Vault;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class HandoverCloseServiceTest {
 final HandoverCompletionAccess access=mock(HandoverCompletionAccess.class);
 final HandoverCompletionService completion=mock(HandoverCompletionService.class);
 final HandoverSessionRepository sessions=mock(HandoverSessionRepository.class);
 final HandoverCompletionEvidenceRepository evidence=mock(HandoverCompletionEvidenceRepository.class);
 final AuditService audit=mock(AuditService.class);
 final HandoverCloseService service=new HandoverCloseService(access,completion,sessions,evidence,audit);
 final UUID c=UUID.randomUUID(),s=UUID.randomUUID();
 final CustomUserPrincipal actor=new CustomUserPrincipal(1L,UUID.randomUUID(),"staff@example.test");
 final HandoverSession session=new HandoverSession(2L,1L);
 final CourtEvidenceVersion version=mock(CourtEvidenceVersion.class);
 final Vault vault=mock(Vault.class);
 final HandoverCompletionAccess.Snapshot snapshot;
 HandoverCloseServiceTest(){
  ReflectionTestUtils.setField(session,"id",3L);ReflectionTestUtils.setField(session,"publicId",s);
  when(version.id()).thenReturn(4L);when(version.sha256()).thenReturn("a".repeat(64));when(vault.getVaultId()).thenReturn(5L);
  snapshot=new HandoverCompletionAccess.Snapshot(new LegalBasisCaseAccess.LockedCase(vault,null,null),session,
   version,"b".repeat(64),List.of(),Set.of());
  when(access.lock(c,s,actor,true)).thenReturn(snapshot);
  when(completion.requireReady(snapshot)).thenReturn(new HandoverCompletionResponse(
   new CompletionProgressResponse(1,1,0,true),new CompletionProgressResponse(1,1,0,true),true,"READY"));
 }
 @Test void pendingGateCannotWriteTerminalStateOrEvidence(){
  doThrow(new BusinessException(ErrorCode.HANDOVER_COMPLETION_PENDING)).when(completion).requireReady(snapshot);
  assertThrows(BusinessException.class,()->service.close(c,s,actor));
  assertEquals(HandoverSessionStatus.OPEN,session.getStatus());verifyNoInteractions(sessions,evidence,audit);
 }
 @Test void closePersistsProofAndRetryPreservesTimeAndAudit(){
  var saved=new java.util.concurrent.atomic.AtomicReference<HandoverCompletionEvidence>();
  when(evidence.findBySessionId(3L)).thenAnswer(i->Optional.ofNullable(saved.get()));
  when(evidence.saveAndFlush(any())).thenAnswer(i->{saved.set(i.getArgument(0));return saved.get();});
  var first=service.close(c,s,actor);var retry=service.close(c,s,actor);
  assertEquals(first,retry);assertEquals("COMPLETED",first.status());assertNotNull(first.closedAt());
  assertEquals(4L,saved.get().getVersionId());assertEquals(1,saved.get().getAssetCount());
  verify(sessions,times(1)).saveAndFlush(session);verify(audit,times(1)).record(any());
 }
 @Test void completedFlagWithoutEvidenceCannotPass(){
  session.close(HandoverSessionStatus.COMPLETED,java.time.LocalDateTime.now());
  assertEquals(ErrorCode.HANDOVER_SESSION_INVALID_STATE,
   assertThrows(BusinessException.class,()->service.close(c,s,actor)).getErrorCode());
  verifyNoInteractions(sessions,audit);
 }
 @Test void staleEvidenceRejected(){
  session.close(HandoverSessionStatus.COMPLETED,java.time.LocalDateTime.now());
  when(evidence.findBySessionId(3L)).thenReturn(Optional.of(new HandoverCompletionEvidence(3L,999L,
   "a".repeat(64),"b".repeat(64),1,1,1L,java.time.LocalDateTime.now())));
  assertEquals(ErrorCode.LEGAL_DECISION_STALE,
   assertThrows(BusinessException.class,()->service.close(c,s,actor)).getErrorCode());
 }
}
