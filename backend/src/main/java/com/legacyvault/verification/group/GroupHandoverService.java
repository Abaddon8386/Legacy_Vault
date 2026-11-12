package com.legacyvault.verification.group;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.service.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.vault.entity.Vault;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;
import static com.legacyvault.common.error.ErrorCode.*;

/**
 * Dịch vụ cổng bàn giao theo nhóm (PS-119/120): điểm danh người thụ hưởng, xin mở lại, Legal quyết định.
 * Được {@link GroupHandoverController}, {@link GroupHandoverReadController}, {@link GroupHandoverReadService} gọi,
 * và {@link #requireReady} được các dịch vụ giao tài sản gọi. Dữ liệu là bảng chỉ-thêm
 * {@code dbo.handover_group_events}; ghi audit {@code HANDOVER_GROUP_CHANGED} và thông báo workflow trong cùng transaction.
 * Khóa: Staff dùng {@code HandoverCompletionAccess.lock}, Legal dùng {@code LegalWorkflowGuard} + khóa phiên.
 */
@Service
public class GroupHandoverService {
 /**
  * Body ghi: {@code expectedRevision} (revision đã xem), {@code presentRecipientIds} (người có mặt, chỉ với ATTENDANCE), {@code reason}.
  */
 public record Body(Long expectedRevision,Set<UUID> presentRecipientIds,String reason) {}
 /**
  * Kết quả ghi: ca, phiên, sự kiện vừa tạo, trạng thái cổng mới và biên nhận thông báo.
  */
 public record Receipt(UUID caseId,UUID sessionId,UUID eventId,GroupState state,com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {}
 /**
  * PS-122: who did something; public ids only.
  *
  * Người thao tác (UUID công khai, họ tên).
  */
 public record Person(UUID userId,String fullName) {}
 /**
  * Current Staff attendance report (the one the gate is bound to).
  *
  * Báo cáo điểm danh hiện hành của Staff.
  */
 public record Attendance(UUID attendanceId,java.time.Instant recordedAt,Person recordedBy,Set<UUID> presentRecipientIds,String reason) {}
 /**
  * The Staff reopen request Legal may decide; present only while AWAITING_LEGAL.
  *
  * Yêu cầu mở lại của Staff đang chờ Legal.
  */
 public record ReopenRequest(UUID requestId,java.time.Instant requestedAt,Person requestedBy,String reason) {}
 /**
  * Latest Legal decision for the case, kept after it is made so the history stays readable.
  *
  * Quyết định gần nhất của Legal.
  */
 public record LegalDecision(UUID eventId,String result,java.time.Instant decidedAt,Person decidedBy,String reason) {}
 /**
  * Real counts of the approved scope; absent people or undelivered assets are never removed from the totals.
  *
  * Tiến độ: tổng tài sản, đã giao, người thụ hưởng cần có mặt và đã có mặt.
  */
 public record Progress(int totalAssets,int deliveredAssets,int requiredRecipients,int presentRecipients) {}
 /**
  * Server computed hints for the UI only; every mutation re-checks on the backend.
  *
  * Gợi ý quyền cho UI: ghi điểm danh, xin mở lại, quyết định, và lý do chặn giao (nếu có).
  */
 public record Capabilities(boolean canRecordAttendance,boolean canRequestReopen,boolean canDecide,String deliveryBlockedReason) {}
 /**
  * Ảnh chụp đầy đủ của cổng nhóm, trả về bởi các endpoint GET {@code .../group-handover}.
  */
 public record View(GroupState state,String snapshot,Set<UUID> requiredRecipientIds,boolean deliveryAllowed,
   UUID caseId,String caseNumber,UUID sessionId,String sessionStatus,Progress progress,Attendance attendance,
   ReopenRequest request,LegalDecision lastDecision,Capabilities capabilities) {
  /**
   * Constructor rút gọn: chỉ trạng thái và cờ cho phép giao, các trường còn lại null.
   */
  public View(GroupState state,String snapshot,Set<UUID> requiredRecipientIds,boolean deliveryAllowed){
   this(state,snapshot,requiredRecipientIds,deliveryAllowed,null,null,null,null,null,null,null,null,null);
  }
 }
 private final JdbcTemplate jdbc;
 private final ObjectMapper json;
 private final HandoverCompletionAccess completion;
 private final LegalWorkflowGuard workflow;
 private final HandoverSessionRepository sessions;
 private final LegalBasisReviewHistoryRepository history;
 private final AuditService audit;
 private final LegalBasisLockedState lockedState;
 private final com.legacyvault.notification.WorkflowNotificationService notifications;
 /**
  * Constructor inject JDBC, JSON, khóa hoàn tất bàn giao, guard Legal, repository phiên, lịch sử review, audit và thông báo.
  */
 public GroupHandoverService(JdbcTemplate jdbc,ObjectMapper json,HandoverCompletionAccess completion,
   LegalWorkflowGuard workflow,HandoverSessionRepository sessions,LegalBasisReviewHistoryRepository history,AuditService audit,LegalBasisLockedState lockedState,
   com.legacyvault.notification.WorkflowNotificationService notifications){
  this.jdbc=jdbc;this.json=json;this.completion=completion;this.workflow=workflow;this.sessions=sessions;this.history=history;this.audit=audit;this.lockedState=lockedState;this.notifications=notifications;
 }
 /**
  * Mã hóa đối tượng thành JSON để lưu.
  */
 private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Cannot encode group state",e);}}
 /**
  * Giải mã JSON đã lưu thành {@link GroupState}.
  */
 private GroupState decode(String value){try{return json.readValue(value,GroupState.class);}catch(Exception e){throw new IllegalStateException("Invalid persisted group state",e);}}
 /**
  * Trạng thái cổng hiện tại của ca (revision lớn nhất), hoặc trạng thái khởi tạo nếu chưa có sự kiện.
  */
 private GroupState current(long caseId){
  var rows=jdbc.queryForList("SELECT TOP(1) state_json FROM dbo.handover_group_events WHERE case_id=? ORDER BY revision DESC",String.class,caseId);
  return rows.isEmpty()?GroupState.initial():decode(rows.get(0));
 }
 /**
  * Khóa và nạp snapshot ca/phiên. Staff: {@code completion.lock}. Legal: khóa ca qua
  * {@code LegalWorkflowGuard.requireProtectedTransition(APPROVAL)}, khóa phiên của Staff được giao.
  *
  * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu không có Staff/phiên; {@code HANDOVER_SESSION_INVALID_STATE} nếu phiên không OPEN
  */
 private HandoverCompletionAccess.Snapshot lock(UUID caseId,UUID sessionId,CustomUserPrincipal actor,boolean legal){
  if(!legal) return completion.lock(caseId,sessionId,actor,true);
  CustomUserPrincipal.requireUserId(actor);
  var locked=workflow.requireProtectedTransition(caseId,LegalWorkflowGuard.ProtectedTransition.APPROVAL);locked.requireOpen();
  var c=locked.verificationCase();
  if(c.getAssignedStaffUserId()==null) throw new BusinessException(RESOURCE_NOT_FOUND);
  var session=sessions.findByPublicIdAndCaseAndStaffForUpdate(sessionId,c.getVerificationCaseId(),c.getAssignedStaffUserId())
    .orElseThrow(()->new BusinessException(RESOURCE_NOT_FOUND));
  lockedState.refresh(session);
  if(session.getStatus()!=HandoverSessionStatus.OPEN) throw new BusinessException(HANDOVER_SESSION_INVALID_STATE);
  return completion.snapshot(locked,session);
 }
 /**
  * Tính vân tay phạm vi hiện tại bằng {@link GroupFingerprint}.
  *
  * @throws BusinessException {@code LEGAL_DECISION_STALE} nếu chưa có quyết định phê duyệt/từ chối của Legal
  */
 private String fingerprint(HandoverCompletionAccess.Snapshot s){
  var approval=history.findFirstByDossierIdAndReviewStatusInOrderByIdDesc(s.locked().dossier().getLegalBasisDossierId(),
    List.of("LEGAL_APPROVED","LEGAL_REJECTED")).orElseThrow(()->new BusinessException(LEGAL_DECISION_STALE));
  return GroupFingerprint.of(s.session().getPublicId(),s.locked().verificationCase().getAssignedStaffUserId(),
    s.locked().verificationCase().getUpdatedAt(),s.locked().dossier().getUpdatedAt(),s.version().version(),
    s.version().sha256(),s.scopeHash(),approval.getPublicId(),s.rows());
 }
 /**
  * Tập UUID người thụ hưởng trực tiếp phải có mặt (suy ra từ các dòng phân bổ đã duyệt).
  */
 private Set<UUID> required(HandoverCompletionAccess.Snapshot s){
  return s.rows().stream().map(ReceiptAllocationRow::beneficiaryPublicId).collect(java.util.stream.Collectors.toUnmodifiableSet());
 }
 /**
  * Authoritative read of the current gate. It takes the same locks as the writes so the state, counts and snapshot it
  * returns are one consistent picture, but it never changes the gate, a right or a decision.
  *
  * Dựng {@link View}: trạng thái hiện tại, vân tay, tiến độ, điểm danh, yêu cầu mở lại, quyết định gần nhất và
  * quyền của vai trò.
  *
  * @param legal true nếu người gọi là Legal
  * @throws BusinessException các lỗi từ {@code lock}
  */
 @Transactional
 public View view(UUID caseId,UUID sessionId,CustomUserPrincipal actor,boolean legal){
  var s=lock(caseId,sessionId,actor,legal);var c=s.locked().verificationCase();var dbId=c.getVerificationCaseId();
  var events=new GroupEventReader(jdbc,json);
  var state=current(dbId);var hash=fingerprint(s);var required=required(s);var fresh=state.allowed(hash);
  var rows=s.rows();
  int delivered=(int)rows.stream().filter(r->s.delivered().contains(r.allocationId())).count();
  var attendanceEvent=events.byId(dbId,state.attendanceId());
  Set<UUID> present=attendanceEvent.map(GroupEventReader.Event::presentRecipientIds).orElse(Set.of());
  var attendance=attendanceEvent.map(e->new Attendance(e.eventId(),e.at(),person(e.actor()),e.presentRecipientIds(),e.reason())).orElse(null);
  var request="AWAITING_LEGAL".equals(state.status())?events.byId(dbId,state.requestId())
    .map(e->new ReopenRequest(e.eventId(),e.at(),person(e.actor()),e.reason())).orElse(null):null;
  var decision=events.lastDecision(dbId).map(e->new LegalDecision(e.eventId(),e.operation(),e.at(),person(e.actor()),e.reason())).orElse(null);
  boolean current=state.allPresent() && Objects.equals(state.snapshot(),hash);
  boolean open=s.session().getStatus()==HandoverSessionStatus.OPEN;
  var caps=new Capabilities(!legal && open,!legal && open && "SUSPENDED".equals(state.status()) && current,
    legal && "AWAITING_LEGAL".equals(state.status()) && state.requestId()!=null && current,blockedReason(state,current,fresh));
  return new View(state,hash,required,fresh,caseId,c.getCaseNumber(),sessionId,s.session().getStatus().name(),
    new Progress(rows.size(),delivered,required.size(),(int)present.stream().filter(required::contains).count()),
    attendance,request,decision,caps);
 }
 /**
  * Chuyển {@code Actor} sang {@link Person}.
  */
 private static Person person(GroupEventReader.Actor a){return new Person(a.userId(),a.fullName());}
 /**
  * Why delivery is blocked right now, or null when the gate is open.
  *
  * Ánh xạ trạng thái sang mã lý do chặn: ATTENDANCE_REQUIRED, LEGAL_REOPEN_REQUIRED, MISSING_RECIPIENTS,
  * AWAITING_LEGAL_DECISION, ATTENDANCE_STALE hoặc BLOCKED.
  */
 private static String blockedReason(GroupState state,boolean current,boolean allowed){
  if(allowed) return null;
  return switch(state.status()){
   case "UNCONFIRMED" -> "ATTENDANCE_REQUIRED";
   case "SUSPENDED" -> state.allPresent()?"LEGAL_REOPEN_REQUIRED":"MISSING_RECIPIENTS";
   case "AWAITING_LEGAL" -> "AWAITING_LEGAL_DECISION";
   default -> current?"BLOCKED":"ATTENDANCE_STALE";
  };
 }
 /**
  * Newest first, no locks and no rights check beyond the caller's assignment, used by the history endpoints.
  *
  * Lịch sử sự kiện phân trang, mới nhất trước.
  *
  * @throws BusinessException {@code VALIDATION_FAILED} nếu trang/kích thước sai (size tối đa 100); {@code RESOURCE_NOT_FOUND} nếu ca/phiên không thuộc phạm vi
  */
 @Transactional(readOnly=true)
 public com.legacyvault.common.web.PageResponse<HistoryItem> history(UUID caseId,UUID sessionId,CustomUserPrincipal actor,boolean legal,int page,int size){
  if(page<0 || size<1 || size>100) throw new BusinessException(VALIDATION_FAILED);
  CustomUserPrincipal.requireUserId(actor);
  long dbId=authorizeHistory(caseId,sessionId,actor,legal);
  var events=new GroupEventReader(jdbc,json);long total=events.count(dbId);
  var items=events.page(dbId,page,size).stream().map(e->new HistoryItem(e.eventId(),e.sessionId(),e.operation(),e.revision(),
    e.state().status(),e.state().allPresent(),e.presentRecipientIds().size(),e.reason(),e.at(),person(e.actor()))).toList();
  return new com.legacyvault.common.web.PageResponse<>(items,page,size,total,(int)((total+size-1)/size));
 }
 /**
  * Một mục lịch sử gửi cho UI.
  */
 public record HistoryItem(UUID eventId,UUID sessionId,String operation,long revision,String resultingStatus,boolean allPresent,
   int presentRecipients,String reason,java.time.Instant at,Person by) {}
 /**
  * History stays readable after the session ends or the case is archived; it only needs the actor's own scope.
  *
  * Kiểm quyền đọc lịch sử và trả khóa nội bộ của ca. Legal: ca có Staff được giao; Staff: phải là Staff của ca và của phiên.
  */
 private long authorizeHistory(UUID caseId,UUID sessionId,CustomUserPrincipal actor,boolean legal){
  var rows=legal
    ?jdbc.queryForList("SELECT c.verification_case_id FROM dbo.verification_cases c JOIN dbo.handover_sessions s ON s.verification_case_id=c.verification_case_id "
      +"WHERE c.public_id=? AND s.public_id=? AND c.assigned_staff_user_id IS NOT NULL",Long.class,caseId.toString(),sessionId.toString())
    :jdbc.queryForList("SELECT c.verification_case_id FROM dbo.verification_cases c JOIN dbo.handover_sessions s ON s.verification_case_id=c.verification_case_id "
      +"WHERE c.public_id=? AND s.public_id=? AND c.assigned_staff_user_id=? AND s.staff_user_id=?",Long.class,caseId.toString(),sessionId.toString(),actor.userId(),actor.userId());
  if(rows.isEmpty()) throw new BusinessException(RESOURCE_NOT_FOUND);
  return rows.get(0);
 }
 /**
  * Yêu cầu cổng đã mở trước khi giao tài sản (phải chạy trong transaction có sẵn).
  *
  * @throws BusinessException {@code GROUP_HANDOVER_BLOCKED} nếu {@code deliveryAllowed=false}
  */
 @Transactional(propagation=Propagation.MANDATORY)
 public void requireReady(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  var v=view(caseId,sessionId,actor,false);
  if(!v.deliveryAllowed()) throw new BusinessException(GROUP_HANDOVER_BLOCKED);
 }
 /**
  * Ghi một thao tác lên cổng nhóm (ATTENDANCE, REQUEST, APPROVE, REJECT).
  * Các bước: kiểm tra đầu vào; khóa ca/phiên; tính hash payload và kiểm tra idempotency (cùng khóa và payload thì trả lại
  * kết quả cũ); so {@code expectedRevision}; chuyển trạng thái bằng {@link GroupState}; chèn sự kiện vào
  * {@code handover_group_events}; ghi audit {@code HANDOVER_GROUP_CHANGED}; ghi thông báo workflow cho phía còn lại.
  *
  * @param key khóa idempotency từ header {@code Idempotency-Key}
  * @throws BusinessException {@code VALIDATION_FAILED}, {@code GROUP_HANDOVER_STALE} (revision lệch hoặc payload khác khóa cũ), {@code GROUP_HANDOVER_BLOCKED} (chuyển trạng thái không hợp lệ)
  */
 @Transactional
 public Receipt mutate(UUID caseId,UUID sessionId,UUID requestId,UUID key,String operation,Body body,CustomUserPrincipal actor,boolean legal){
  long actorId=CustomUserPrincipal.requireUserId(actor);
  if(key==null || body==null || body.expectedRevision()==null || body.expectedRevision()<0 || body.reason()==null
    || body.reason().isBlank() || body.reason().length()>1000) throw new BusinessException(VALIDATION_FAILED);
  if((legal&&!Set.of("APPROVE","REJECT").contains(operation)) || (!legal&&!Set.of("ATTENDANCE","REQUEST").contains(operation)))
    throw new BusinessException(VALIDATION_FAILED);
  if(body.presentRecipientIds()!=null && body.presentRecipientIds().stream().anyMatch(Objects::isNull)) throw new BusinessException(VALIDATION_FAILED);
  var s=lock(caseId,sessionId,actor,legal);var c=s.locked().verificationCase();long id=c.getVerificationCaseId();
  var payload=AllocationScopeHash.hashCanonicalValues(List.of(sessionId.toString(),String.valueOf(requestId),operation,
    body.expectedRevision().toString(),body.reason(),encode(body.presentRecipientIds()==null?List.of():body.presentRecipientIds().stream().sorted().toList())));
  var replay=jdbc.queryForList("SELECT public_id,payload_hash,state_json FROM dbo.handover_group_events WHERE case_id=? AND actor_user_id=? AND idempotency_key=?",
    id,actorId,key.toString());
  if(!replay.isEmpty()){
   var row=replay.get(0);
   if(!payload.equals(row.get("payload_hash"))) throw new BusinessException(GROUP_HANDOVER_STALE);
   var eventId=UUID.fromString(row.get("public_id").toString());
   var notification=notifications.existing(id,"group:"+eventId);
   return new Receipt(caseId,sessionId,eventId,decode(row.get("state_json").toString()),notification);
  }
  var before=current(id);
  if(before.revision()!=body.expectedRevision()) throw new BusinessException(GROUP_HANDOVER_STALE);
  var hash=fingerprint(s);var eventId=UUID.randomUUID();GroupState after;
  try{
   after=switch(operation){
    case "ATTENDANCE" -> {
     if(s.session().getStatus()!=HandoverSessionStatus.OPEN || body.presentRecipientIds()==null) throw new IllegalArgumentException();
     yield before.attendance(eventId,hash,required(s),body.presentRecipientIds());
    }
    case "REQUEST" -> before.request(eventId,hash);
    case "APPROVE","REJECT" -> before.decide(requestId,operation.equals("APPROVE"),hash);
    default -> throw new IllegalArgumentException();
   };
  }catch(IllegalArgumentException e){throw new BusinessException(VALIDATION_FAILED);}
   catch(IllegalStateException e){throw new BusinessException(GROUP_HANDOVER_BLOCKED);}
  // Audit and event persistence are part of the same transaction as the gate state.
  jdbc.update("INSERT INTO dbo.handover_group_events(public_id,case_id,session_id,actor_user_id,operation,idempotency_key,payload_hash,revision,state_json,present_json,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    eventId.toString(),id,s.session().getId(),actorId,operation,key.toString(),payload,after.revision(),encode(after),
    encode(body.presentRecipientIds()==null?Set.of():body.presentRecipientIds()),body.reason().trim());
  audit.record(new AuditEvent(AuditAction.HANDOVER_GROUP_CHANGED,AuditActorType.USER,actorId,s.locked().vault().getVaultId(),
    "HANDOVER_SESSION",s.session().getId(),before.status(),after.status(),null,
    Map.of("casePublicId",caseId.toString(),"eventPublicId",eventId.toString(),"operation",operation),"GROUP_HANDOVER","PS-120"));
  var notification=notifications.record(c,legal?com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF:
    com.legacyvault.notification.WorkflowNotificationService.Workspace.LEGAL,"HANDOVER_GROUP_"+operation,"group:"+eventId,body.reason().trim());
  return new Receipt(caseId,sessionId,eventId,after,notification);
 }
}
