package com.legacyvault.verification.service;
import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverArchiveResponse;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
@Service
public class HandoverArchiveService {
private final com.legacyvault.verification.group.GroupHandoverService group;
 private final HandoverSessionCaseAccess casesAccess;
 private final HandoverCompletionAccess access;
 private final HandoverCompletionService completion;
 private final HandoverCloseService close;
 private final HandoverSessionRepository sessions;
 private final HandoverCompletionEvidenceRepository evidence;
 private final HandoverReceiptRepository receipts;
 private final HandoverReceiptAssetRepository receiptAssets;
 private final VerificationCaseRepository cases;
 private final VaultRepository vaults;
 private final LegalBasisLockedState state;
 private final AuditService audit;
 public HandoverArchiveService(HandoverSessionCaseAccess casesAccess,HandoverCompletionAccess access,
  HandoverCompletionService completion,HandoverCloseService close,HandoverSessionRepository sessions,
  HandoverCompletionEvidenceRepository evidence,HandoverReceiptRepository receipts,HandoverReceiptAssetRepository receiptAssets,
  VerificationCaseRepository cases,VaultRepository vaults,LegalBasisLockedState state,AuditService audit, com.legacyvault.verification.group.GroupHandoverService group){
this.group=group;
  this.casesAccess=casesAccess;this.access=access;this.completion=completion;this.close=close;this.sessions=sessions;
  this.evidence=evidence;this.receipts=receipts;this.receiptAssets=receiptAssets;this.cases=cases;
  this.vaults=vaults;this.state=state;this.audit=audit;
 }
 @Transactional
 public HandoverArchiveResponse archive(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  Long staff=CustomUserPrincipal.requireUserId(actor);
  var initial=casesAccess.lockByPublicCaseId(caseId,staff);
  if(Vault.STATUS_ARCHIVED.equals(initial.vault().getStatus())){
   if(!VerificationCase.STATUS_CLOSED.equals(initial.verificationCase().getStatus()))
    throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
   var session=sessions.findByPublicIdAndCaseAndStaffForUpdate(sessionId,
    initial.verificationCase().getVerificationCaseId(),staff)
    .orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
   state.refresh(session);
   if(session.getStatus()!=HandoverSessionStatus.COMPLETED
     ||!Objects.equals(initial.verificationCase().getClosedHandoverSessionId(),session.getId())
     ||evidence.findBySessionId(session.getId()).isEmpty())
    throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
   return response(initial.vault(),initial.verificationCase(),sessionId);
  }
  var s=access.lock(caseId,sessionId,actor,true);
  group.requireReady(caseId,sessionId,actor);
  close.requireEvidence(s);
  completion.requireReady(s);
  requireReceipts(s);
  var now=LocalDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
  // Flush case before marking Vault archived, so read-only triggers permit this last valid transition.
  s.locked().verificationCase().complete(now,s.session().getId());
  cases.saveAndFlush(s.locked().verificationCase());
  s.locked().vault().archiveAfterHandover();
  vaults.saveAndFlush(s.locked().vault());
  audit.record(new AuditEvent(AuditAction.VAULT_HANDOVER_ARCHIVED,AuditActorType.USER,staff,
   s.locked().vault().getVaultId(),"VAULT",s.locked().vault().getVaultId(),
   Vault.STATUS_HANDOVER_IN_PROGRESS,Vault.STATUS_ARCHIVED,null,
   Map.of("caseId",caseId.toString(),"sessionId",sessionId.toString()),"ST-29","LV-CLOSE-001"));
  return response(s.locked().vault(),s.locked().verificationCase(),sessionId);
 }
 private void requireReceipts(HandoverCompletionAccess.Snapshot s){
  var records=receipts.findByHandoverSessionIdOrderByConfirmedAtDesc(s.session().getId());
  var superseded=records.stream().map(HandoverReceipt::getSupersedesReceiptId).filter(Objects::nonNull)
   .collect(java.util.stream.Collectors.toSet());
  Set<Long> covered=new HashSet<>();
  records.stream().filter(r->!superseded.contains(r.getId())&&r.getDossierVersionId().equals(s.version().id())
   &&r.getSha256Hash().equals(s.version().sha256())&&r.getAllocationHash().equals(s.scopeHash()))
   .forEach(r->receiptAssets.findByHandoverReceiptIdOrderById(r.getId()).stream()
    .map(HandoverReceiptAsset::getAllocationId).forEach(covered::add));
  if(s.rows().isEmpty()||s.rows().stream().anyMatch(r->!covered.contains(r.allocationId())))
   throw new BusinessException(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE);
 }
 private HandoverArchiveResponse response(Vault vault,VerificationCase c,UUID sessionId){
  return new HandoverArchiveResponse(vault.getPublicId(),c.getPublicId(),sessionId,vault.getStatus(),c.getStatus(),
   c.getClosedAt().toInstant(ZoneOffset.UTC));
 }
}
