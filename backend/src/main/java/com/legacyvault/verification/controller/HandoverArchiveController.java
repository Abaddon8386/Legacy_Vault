package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverArchiveResponse;
import com.legacyvault.verification.service.HandoverArchiveService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class HandoverArchiveController {
 private final HandoverArchiveService service;
 public HandoverArchiveController(HandoverArchiveService service){this.service=service;}
 @PostMapping("/archive")
 public HandoverArchiveResponse archive(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @AuthenticationPrincipal CustomUserPrincipal actor){return service.archive(caseId,sessionId,actor);}
}
