package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.RecordWillComparisonRequest;
import com.legacyvault.verification.dto.WillComparisonOverviewResponse;
import com.legacyvault.verification.dto.WillComparisonResponse;
import com.legacyvault.verification.service.WillComparisonService;
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
import java.util.UUID;

/**
 * Legal đối chiếu bản di chúc giấy gốc với bản scan (PS-40, ST-15). Chỉ LEGAL_VERIFIER; Staff, Owner nhận 403.
 * Không có API sửa hay xóa: kết quả đối chiếu là chứng cứ.
 */
@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases/{caseId}/will-comparisons")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalWillComparisonController {

    private final WillComparisonService service;

    public LegalWillComparisonController(WillComparisonService service) {
        this.service = service;
    }

    @GetMapping
    public WillComparisonOverviewResponse overview(@PathVariable UUID caseId) {
        return service.overview(caseId);
    }

    @PostMapping
    public ResponseEntity<WillComparisonResponse> record(
            @PathVariable UUID caseId,
            @Valid @RequestBody RecordWillComparisonRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        WillComparisonResponse created = service.record(caseId, principal, request);
        URI location = URI.create("/api/v1/legal-verifications/verification-cases/" + caseId + "/will-comparisons");
        return ResponseEntity.created(location).body(created);
    }
}
