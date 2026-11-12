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
/**
 * ST-28 (LV-CLOSE-001): đóng phiên bàn giao sau khi hoàn tất cả tài sản và người nhận.
 *
 * Được gọi bởi {@code HandoverCloseController} qua
 * {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/close} (POST, vai trò {@code STAFF_EXECUTOR}), trả {@link HandoverCloseResponse}.
 * Cập nhật {@code handover_sessions} (COMPLETED), lưu {@link HandoverCompletionEvidence} và ghi audit {@code HANDOVER_SESSION_COMPLETED}.
 */
@Service
public class HandoverCloseService {
private final com.legacyvault.verification.group.GroupHandoverService group;
 private final HandoverCompletionAccess access;
 private final HandoverCompletionService completion;
 private final HandoverSessionRepository sessions;
 private final HandoverCompletionEvidenceRepository evidence;
 private final AuditService audit;
 /**
  * Khởi tạo với bộ truy cập snapshot, service hoàn tất, repository phiên/bằng chứng, audit và bàn giao nhóm.
  */
 public HandoverCloseService(HandoverCompletionAccess access,HandoverCompletionService completion,
  HandoverSessionRepository sessions,HandoverCompletionEvidenceRepository evidence,AuditService audit, com.legacyvault.verification.group.GroupHandoverService group){
this.group=group;
  this.access=access;this.completion=completion;this.sessions=sessions;this.evidence=evidence;this.audit=audit;
 }
 /**
  * Đóng phiên. Idempotent: luôn khóa snapshot (cho phép phiên đã hoàn tất), kiểm tra bàn giao nhóm sẵn sàng và yêu cầu cổng
  * hoàn tất kép đạt (cả khi phiên đã COMPLETED). Nếu phiên đã COMPLETED thì chỉ xác minh bằng chứng và trả kết quả. Ngược lại: đóng phiên, lưu bằng chứng (phiên bản, SHA-256, hash phạm vi,
  * số tài sản, số người nhận) và ghi audit.
  *
  * @param caseId UUID công khai của ca
  * @param sessionId UUID công khai của phiên
  * @param actor Staff đang đăng nhập
  * @return trạng thái phiên và thời điểm đóng
  * @throws com.legacyvault.common.error.BusinessException HANDOVER_COMPLETION_PENDING, HANDOVER_SESSION_INVALID_STATE, LEGAL_DECISION_STALE
  */
 @Transactional
 public HandoverCloseResponse close(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  var s=access.lock(caseId,sessionId,actor,true);
  group.requireReady(caseId,sessionId,actor);
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
 /**
  * Yêu cầu phiên đã COMPLETED và bằng chứng đóng phiên khớp snapshot hiện tại (phiên bản, SHA-256, hash phạm vi).
  * Cũng được {@link HandoverArchiveService} gọi. Phải có transaction sẵn ({@code Propagation.MANDATORY}).
  *
  * @return bằng chứng đóng phiên
  * @throws com.legacyvault.common.error.BusinessException HANDOVER_SESSION_INVALID_STATE (chưa có bản ghi bằng chứng),
  *         LEGAL_DECISION_STALE (phiên chưa COMPLETED hoặc bằng chứng không còn khớp snapshot)
  */
 @Transactional(propagation=Propagation.MANDATORY)
 public HandoverCompletionEvidence requireEvidence(HandoverCompletionAccess.Snapshot s){
  var e=evidence.findBySessionId(s.session().getId()).orElseThrow(()->new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE));
  if(s.session().getStatus()!=HandoverSessionStatus.COMPLETED
   ||!Objects.equals(e.getVersionId(),s.version().id())
   ||!Objects.equals(e.getSha256(),s.version().sha256())||!Objects.equals(e.getScopeHash(),s.scopeHash()))
   throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
  return e;
 }
 /**
  * Dựng response gồm UUID phiên, trạng thái và thời điểm đóng.
  */
 private HandoverCloseResponse response(HandoverSession s){
  return new HandoverCloseResponse(s.getPublicId(),s.getStatus().name(),s.getClosedAt().toInstant(ZoneOffset.UTC));
 }
}
