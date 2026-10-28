package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.service.WorkflowNotificationService;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/v1/workflow-notifications")
public class WorkflowNotificationController {
 private final WorkflowNotificationService service;
 public WorkflowNotificationController(WorkflowNotificationService service){this.service=service;}
 @GetMapping
 @PreAuthorize("(#workspace == 'LEGAL' and hasRole('LEGAL_VERIFIER')) or (#workspace == 'STAFF' and hasRole('STAFF_EXECUTOR'))")
 public ResponseEntity<List<WorkflowNotificationService.Item>> list(@AuthenticationPrincipal CustomUserPrincipal principal,@RequestParam String workspace){
  return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(CustomUserPrincipal.requireUserId(principal),workspace));
 }
 public record ReadReceipt(UUID id, boolean read) {}
 @PutMapping("/{id}/read")
 @PreAuthorize("(#workspace == 'LEGAL' and hasRole('LEGAL_VERIFIER')) or (#workspace == 'STAFF' and hasRole('STAFF_EXECUTOR'))")
 public ResponseEntity<ReadReceipt> read(@AuthenticationPrincipal CustomUserPrincipal principal,@RequestParam String workspace,@PathVariable UUID id){
  service.read(CustomUserPrincipal.requireUserId(principal),workspace,id);return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new ReadReceipt(id,true));
 }
}
