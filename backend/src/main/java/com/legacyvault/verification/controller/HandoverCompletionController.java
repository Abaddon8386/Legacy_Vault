package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverCompletionResponse;
import com.legacyvault.verification.service.HandoverCompletionService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class HandoverCompletionController {
 private final HandoverCompletionService service;
 public HandoverCompletionController(HandoverCompletionService service){this.service=service;}
 @GetMapping("/completion-progress")
 public HandoverCompletionResponse get(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @AuthenticationPrincipal CustomUserPrincipal actor){return service.get(caseId,sessionId,actor);}
}
