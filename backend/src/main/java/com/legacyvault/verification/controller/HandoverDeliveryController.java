package com.legacyvault.verification.controller;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.EligibleHandoverAssetResponse;
import com.legacyvault.verification.dto.HandoverDeliveryRequest;
import com.legacyvault.verification.dto.HandoverItemResponse;
import com.legacyvault.verification.service.HandoverDeliveryService;

import jakarta.validation.Valid;

/**
 * PS-64 / PS-65 (ST-25): scope of assets that may be handed over and the recorded deliveries of a session.
 * Staff Executor only; ownership of the case and session is enforced by {@code HandoverAuthorizationGuard}.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class HandoverDeliveryController {

    private final HandoverDeliveryService service;

    public HandoverDeliveryController(HandoverDeliveryService service) {
        this.service = service;
    }

    @GetMapping("/eligible-assets")
    public List<EligibleHandoverAssetResponse> eligibleAssets(@PathVariable UUID caseId,
            @PathVariable UUID sessionId, @RequestParam(required = false) UUID recipientId,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return service.eligibleAssets(caseId, sessionId, recipientId, principal);
    }

    @PostMapping("/deliveries")
    public ResponseEntity<List<HandoverItemResponse>> deliver(@PathVariable UUID caseId,
            @PathVariable UUID sessionId, @Valid @RequestBody HandoverDeliveryRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        List<HandoverItemResponse> created = service.deliver(caseId, sessionId, request, principal);
        URI location = URI.create("/api/v1/staff/verification-cases/" + caseId + "/handover-sessions/" + sessionId
                + "/deliveries");
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping("/deliveries")
    public List<HandoverItemResponse> deliveries(@PathVariable UUID caseId, @PathVariable UUID sessionId,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return service.list(caseId, sessionId, principal);
    }
}
