package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.CompletionProgressResponse;
import com.legacyvault.verification.service.BeneficiaryCompletionService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class BeneficiaryCompletionController {
 private final BeneficiaryCompletionService service;
 public BeneficiaryCompletionController(BeneficiaryCompletionService service){this.service=service;}
 @GetMapping("/beneficiary-completion")
 public CompletionProgressResponse get(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @AuthenticationPrincipal CustomUserPrincipal actor){return service.get(caseId,sessionId,actor);}
}
