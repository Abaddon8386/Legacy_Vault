package com.legacyvault.verification.group;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.error.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
public class GroupHandoverController {
 private final GroupHandoverService service;
 public GroupHandoverController(GroupHandoverService service){this.service=service;}
 private ResponseEntity<?> ok(Object value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);}
 @PostMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/attendance")
 @PreAuthorize("hasRole('STAFF_EXECUTOR')")
 public ResponseEntity<?> attendance(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @RequestHeader("Idempotency-Key") UUID key,@RequestBody GroupHandoverService.Body body,@AuthenticationPrincipal CustomUserPrincipal actor){
  return ok(service.mutate(caseId,sessionId,null,key,"ATTENDANCE",body,actor,false));
 }
 @PostMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/reopen-requests")
 @PreAuthorize("hasRole('STAFF_EXECUTOR')")
 public ResponseEntity<?> request(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @RequestHeader("Idempotency-Key") UUID key,@RequestBody GroupHandoverService.Body body,@AuthenticationPrincipal CustomUserPrincipal actor){
  return ok(service.mutate(caseId,sessionId,null,key,"REQUEST",body,actor,false));
 }
 public record Decision(Long expectedRevision,String decision,String reason){}
 @PostMapping("/api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/reopen-requests/{requestId}/decision")
 @PreAuthorize("hasRole('LEGAL_VERIFIER')")
 public ResponseEntity<?> decide(@PathVariable UUID caseId,@PathVariable UUID sessionId,@PathVariable UUID requestId,
  @RequestHeader("Idempotency-Key") UUID key,@RequestBody Decision body,@AuthenticationPrincipal CustomUserPrincipal actor){
  if(body==null || !Set.of("APPROVE","REJECT").contains(body.decision()==null?"":body.decision())) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
  return ok(service.mutate(caseId,sessionId,requestId,key,body.decision(),new GroupHandoverService.Body(body.expectedRevision(),null,body.reason()),actor,true));
 }
 @GetMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover")
 @PreAuthorize("hasRole('STAFF_EXECUTOR')")
 public ResponseEntity<?> staffView(@PathVariable UUID caseId,@PathVariable UUID sessionId,@AuthenticationPrincipal CustomUserPrincipal actor){
  return ok(service.view(caseId,sessionId,actor,false));
 }
 @GetMapping("/api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover")
 @PreAuthorize("hasRole('LEGAL_VERIFIER')")
 public ResponseEntity<?> legalView(@PathVariable UUID caseId,@PathVariable UUID sessionId,@AuthenticationPrincipal CustomUserPrincipal actor){
  return ok(service.view(caseId,sessionId,actor,true));
 }
}
