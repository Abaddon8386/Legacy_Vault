package com.legacyvault.verification.group;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.error.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
/**
 * Ghi nhận điểm danh và quy trình mở lại (reopen) của bàn giao theo nhóm (PS-119/120).
 * Mọi response gắn {@code Cache-Control: no-store}; ghi qua {@link GroupHandoverService#mutate}, đọc qua
 * {@link GroupHandoverService#view}. Các thao tác ghi bắt buộc header {@code Idempotency-Key} (UUID).
 */
@RestController
public class GroupHandoverController {
 private final GroupHandoverService service;
 public GroupHandoverController(GroupHandoverService service){this.service=service;}
 /**
  * Bọc {@code value} vào response 200 không cache.
  */
 private ResponseEntity<?> ok(Object value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);}
 /**
  * {@code POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/attendance}
  * Quyền: {@code ROLE_STAFF_EXECUTOR}. Staff ghi danh sách người thụ hưởng có mặt. Body
  * {@link GroupHandoverService.Body}; trả {@link GroupHandoverService.Receipt}.
  */
 @PostMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/attendance")
 @PreAuthorize("hasRole('STAFF_EXECUTOR')")
 public ResponseEntity<?> attendance(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @RequestHeader("Idempotency-Key") UUID key,@RequestBody GroupHandoverService.Body body,@AuthenticationPrincipal CustomUserPrincipal actor){
  return ok(service.mutate(caseId,sessionId,null,key,"ATTENDANCE",body,actor,false));
 }
 /**
  * {@code POST .../handover-sessions/{sessionId}/group-handover/reopen-requests}
  * Quyền: {@code ROLE_STAFF_EXECUTOR}. Staff xin Legal cho mở lại cổng bàn giao (thao tác REQUEST).
  */
 @PostMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/reopen-requests")
 @PreAuthorize("hasRole('STAFF_EXECUTOR')")
 public ResponseEntity<?> request(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @RequestHeader("Idempotency-Key") UUID key,@RequestBody GroupHandoverService.Body body,@AuthenticationPrincipal CustomUserPrincipal actor){
  return ok(service.mutate(caseId,sessionId,null,key,"REQUEST",body,actor,false));
 }
 /**
  * Body quyết định của Legal: {@code expectedRevision} (chống ghi đè), {@code decision} (APPROVE hoặc REJECT), {@code reason}.
  */
 public record Decision(Long expectedRevision,String decision,String reason){}
 /**
  * {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/reopen-requests/{requestId}/decision}
  * Quyền: {@code ROLE_LEGAL_VERIFIER}. Phê duyệt hoặc từ chối yêu cầu mở lại.
  *
  * @throws BusinessException {@code VALIDATION_FAILED} nếu {@code decision} không phải APPROVE hoặc REJECT
  */
 @PostMapping("/api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/reopen-requests/{requestId}/decision")
 @PreAuthorize("hasRole('LEGAL_VERIFIER')")
 public ResponseEntity<?> decide(@PathVariable UUID caseId,@PathVariable UUID sessionId,@PathVariable UUID requestId,
  @RequestHeader("Idempotency-Key") UUID key,@RequestBody Decision body,@AuthenticationPrincipal CustomUserPrincipal actor){
  if(body==null || !Set.of("APPROVE","REJECT").contains(body.decision()==null?"":body.decision())) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
  return ok(service.mutate(caseId,sessionId,requestId,key,body.decision(),new GroupHandoverService.Body(body.expectedRevision(),null,body.reason()),actor,true));
 }
 /**
  * {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover}
  * Quyền: {@code ROLE_STAFF_EXECUTOR}. Trạng thái cổng nhóm nhìn từ Staff.
  */
 @GetMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover")
 @PreAuthorize("hasRole('STAFF_EXECUTOR')")
 public ResponseEntity<?> staffView(@PathVariable UUID caseId,@PathVariable UUID sessionId,@AuthenticationPrincipal CustomUserPrincipal actor){
  return ok(service.view(caseId,sessionId,actor,false));
 }
 /**
  * {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover}
  * Quyền: {@code ROLE_LEGAL_VERIFIER}. Trạng thái cổng nhóm nhìn từ Legal.
  */
 @GetMapping("/api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover")
 @PreAuthorize("hasRole('LEGAL_VERIFIER')")
 public ResponseEntity<?> legalView(@PathVariable UUID caseId,@PathVariable UUID sessionId,@AuthenticationPrincipal CustomUserPrincipal actor){
  return ok(service.view(caseId,sessionId,actor,true));
 }
}
