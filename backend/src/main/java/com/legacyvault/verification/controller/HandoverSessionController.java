package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverSessionResponse;
import com.legacyvault.verification.dto.HandoverSessionStatusRequest;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.service.HandoverSessionService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class HandoverSessionController {
    private final HandoverSessionService service;

    public HandoverSessionController(HandoverSessionService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<HandoverSessionResponse> open(@PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        HandoverSessionResponse response = service.open(caseId, principal);
        URI location = URI.create("/api/v1/staff/verification-cases/" + caseId
                + "/handover-sessions/" + response.sessionId());
        return ResponseEntity.created(location).body(response);
    }

    @GetMapping
    public List<HandoverSessionResponse> list(@PathVariable UUID caseId,
            @RequestParam(required = false) HandoverSessionStatus status,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return service.list(caseId, status, principal);
    }

    @GetMapping("/{sessionId}")
    public HandoverSessionResponse get(@PathVariable UUID caseId, @PathVariable UUID sessionId,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return service.get(caseId, sessionId, principal);
    }

    @PatchMapping("/{sessionId}/status")
    public HandoverSessionResponse updateStatus(@PathVariable UUID caseId, @PathVariable UUID sessionId,
            @Valid @RequestBody HandoverSessionStatusRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return service.updateStatus(caseId, sessionId, request, principal);
    }
}
