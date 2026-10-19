package com.legacyvault.verification;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.service.*;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class HandoverArchiveServiceTest {
 final HandoverSessionCaseAccess casesAccess=mock(HandoverSessionCaseAccess.class);
 final HandoverCompletionAccess access=mock(HandoverCompletionAccess.class);
 final HandoverCompletionService completion=mock(HandoverCompletionService.class);
 final HandoverCloseService close=mock(HandoverCloseService.class);
 final HandoverSessionRepository sessions=mock(HandoverSessionRepository.class);
 final HandoverCompletionEvidenceRepository evidence=mock(HandoverCompletionEvidenceRepository.class);
 final HandoverReceiptRepository receipts=mock(HandoverReceiptRepository.class);
 final HandoverReceiptAssetRepository receiptAssets=mock(HandoverReceiptAssetRepository.class);
 final VerificationCaseRepository cases=mock(VerificationCaseRepository.class);
 final VaultRepository vaults=mock(VaultRepository.class);
 final LegalBasisLockedState state=mock(LegalBasisLockedState.class);
 final AuditService audit=mock(AuditService.class);
 final HandoverArchiveService service=new HandoverArchiveService(casesAccess,access,completion,close,
  sessions,evidence,receipts,receiptAssets,cases,vaults,state,audit);
 final UUID caseId=UUID.randomUUID(),sessionId=UUID.randomUUID();
 final CustomUserPrincipal actor=new CustomUserPrincipal(1L,UUID.randomUUID(),"staff@example.test");
 final Vault vault=new Vault();
 final VerificationCase c=new VerificationCase(5L,java.time.LocalDateTime.now(),1L);
 final HandoverSession session=new HandoverSession(2L,1L);
 final HandoverCompletionAccess.Snapshot snapshot;
 HandoverArchiveServiceTest(){
  ReflectionTestUtils.setField(vault,"vaultId",5L);ReflectionTestUtils.setField(vault,"publicId",UUID.randomUUID());
  ReflectionTestUtils.setField(vault,"status",Vault.STATUS_HANDOVER_IN_PROGRESS);
  ReflectionTestUtils.setField(c,"verificationCaseId",2L);ReflectionTestUtils.setField(c,"publicId",caseId);
  ReflectionTestUtils.setField(session,"id",3L);session.close(HandoverSessionStatus.COMPLETED,java.time.LocalDateTime.now());
  var version=mock(CourtEvidenceVersion.class);when(version.id()).thenReturn(4L);when(version.sha256()).thenReturn("hash");
  var row=new ReceiptAllocationRow(1,6L,7L,UUID.randomUUID(),8L,UUID.randomUUID(),"VERIFIED_AT_COUNTER","APPROVED",null);
  snapshot=new HandoverCompletionAccess.Snapshot(new LegalBasisCaseAccess.LockedCase(vault,c,null),
   session,version,"scope",List.of(row),Set.of(6L));
  when(casesAccess.lockByPublicCaseId(caseId,1L)).thenReturn(new HandoverSessionCaseAccess.LockedCase(vault,c));
  when(access.lock(caseId,sessionId,actor,true)).thenReturn(snapshot);
  when(sessions.findByPublicIdAndCaseAndStaffForUpdate(sessionId,2L,1L)).thenReturn(Optional.of(session));
  when(evidence.findBySessionId(3L)).thenReturn(Optional.of(mock(HandoverCompletionEvidence.class)));
 }
 void receipt(){
  var receipt=mock(HandoverReceipt.class);when(receipt.getId()).thenReturn(9L);
  when(receipt.getDossierVersionId()).thenReturn(4L);when(receipt.getSha256Hash()).thenReturn("hash");
  when(receipt.getAllocationHash()).thenReturn("scope");
  when(receipts.findByHandoverSessionIdOrderByConfirmedAtDesc(3L)).thenReturn(List.of(receipt));
  var item=mock(HandoverReceiptAsset.class);when(item.getAllocationId()).thenReturn(6L);
  when(receiptAssets.findByHandoverReceiptIdOrderById(9L)).thenReturn(List.of(item));
 }
 @Test void missingReceiptCannotArchive(){
  assertEquals(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE,assertThrows(BusinessException.class,()->
   service.archive(caseId,sessionId,actor)).getErrorCode());
  assertEquals("OPEN",c.getStatus());assertEquals(Vault.STATUS_HANDOVER_IN_PROGRESS,vault.getStatus());
  verifyNoInteractions(cases,vaults,audit);
 }
 @Test void archiveFlushesCaseBeforeVaultAndRetryDoesNotRepeatAudit(){
  receipt();var result=service.archive(caseId,sessionId,actor);
  assertEquals("CLOSED",result.caseStatus());assertEquals("ARCHIVED",result.vaultStatus());
  assertEquals(result,service.archive(caseId,sessionId,actor));
  var order=inOrder(cases,vaults);order.verify(cases).saveAndFlush(c);order.verify(vaults).saveAndFlush(vault);
  verify(audit,times(1)).record(any());
 }
 @Test void pendingRecheckPreventsArchiveEvenWithCompletedSession(){
  receipt();doThrow(new BusinessException(ErrorCode.HANDOVER_COMPLETION_PENDING)).when(completion).requireReady(snapshot);
  assertThrows(BusinessException.class,()->service.archive(caseId,sessionId,actor));
  verifyNoInteractions(cases,vaults,audit);
 }
 @Test void archiveDoesNotTrustCompletedFlagWithoutProof(){
  receipt();doThrow(new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE)).when(close).requireEvidence(snapshot);
  assertThrows(BusinessException.class,()->service.archive(caseId,sessionId,actor));
  verifyNoInteractions(cases,vaults,audit);
 }
}
