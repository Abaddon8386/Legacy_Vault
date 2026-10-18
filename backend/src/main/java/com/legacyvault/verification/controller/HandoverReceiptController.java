package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.CreateHandoverReceiptRequest;
import com.legacyvault.verification.dto.HandoverReceiptResponse;
import com.legacyvault.verification.service.HandoverReceiptService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class HandoverReceiptController {
    private final HandoverReceiptService service;

    public HandoverReceiptController(HandoverReceiptService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<HandoverReceiptResponse> create(@PathVariable UUID caseId,
            @PathVariable UUID sessionId, @Valid @RequestBody CreateHandoverReceiptRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        HandoverReceiptResponse response = service.create(caseId, sessionId, request, principal);
        URI location = URI.create("/api/v1/staff/verification-cases/" + caseId
                + "/handover-sessions/" + sessionId + "/receipts/" + response.receiptId());
        return ResponseEntity.created(location).body(response);
    }

    @GetMapping
    public List<HandoverReceiptResponse> list(@PathVariable UUID caseId, @PathVariable UUID sessionId,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return service.list(caseId, sessionId, principal);
    }

    @GetMapping("/{receiptId}")
    public HandoverReceiptResponse get(@PathVariable UUID caseId, @PathVariable UUID sessionId,
            @PathVariable UUID receiptId, @AuthenticationPrincipal CustomUserPrincipal principal) {
        return service.get(caseId, sessionId, receiptId, principal);
    }
}
