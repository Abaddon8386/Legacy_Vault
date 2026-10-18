package com.legacyvault.verification.service;
import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverCloseResponse;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.util.*;
@Service
public class HandoverCloseService {
 private final HandoverCompletionAccess access;
 private final HandoverCompletionService completion;
 private final HandoverSessionRepository sessions;
 private final HandoverCompletionEvidenceRepository evidence;
 private final AuditService audit;
 public HandoverCloseService(HandoverCompletionAccess access,HandoverCompletionService completion,
  HandoverSessionRepository sessions,HandoverCompletionEvidenceRepository evidence,AuditService audit){
  this.access=access;this.completion=completion;this.sessions=sessions;this.evidence=evidence;this.audit=audit;
 }
 @Transactional
 public HandoverCloseResponse close(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  var s=access.lock(caseId,sessionId,actor,true);
  var progress=completion.requireReady(s);
  if(s.session().getStatus()==HandoverSessionStatus.COMPLETED){
   requireEvidence(s);
   return response(s.session());
  }
  if(evidence.findBySessionId(s.session().getId()).isPresent())
   throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
  var now=LocalDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
  s.session().close(HandoverSessionStatus.COMPLETED,now);
  sessions.saveAndFlush(s.session());
  evidence.saveAndFlush(new HandoverCompletionEvidence(s.session().getId(),s.version().id(),s.version().sha256(),
   s.scopeHash(),progress.assets().total(),progress.beneficiaries().total(),actor.userId(),now));
  audit.record(new AuditEvent(AuditAction.HANDOVER_SESSION_COMPLETED,AuditActorType.USER,actor.userId(),
   s.locked().vault().getVaultId(),"HANDOVER_SESSION",s.session().getId(),"OPEN","COMPLETED",null,
   Map.of("sessionId",sessionId.toString(),"assetCount",progress.assets().total(),
    "beneficiaryCount",progress.beneficiaries().total()),"ST-28","LV-CLOSE-001"));
  return response(s.session());
 }
 @Transactional(propagation=Propagation.MANDATORY)
 public HandoverCompletionEvidence requireEvidence(HandoverCompletionAccess.Snapshot s){
  var e=evidence.findBySessionId(s.session().getId()).orElseThrow(()->new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE));
  if(s.session().getStatus()!=HandoverSessionStatus.COMPLETED
   ||!Objects.equals(e.getVersionId(),s.version().id())
   ||!Objects.equals(e.getSha256(),s.version().sha256())||!Objects.equals(e.getScopeHash(),s.scopeHash()))
   throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
  return e;
 }
 private HandoverCloseResponse response(HandoverSession s){
  return new HandoverCloseResponse(s.getPublicId(),s.getStatus().name(),s.getClosedAt().toInstant(ZoneOffset.UTC));
 }
}
