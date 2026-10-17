package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.OriginalWillIntakeResponse;
import com.legacyvault.verification.dto.RecordOriginalWillRequest;
import com.legacyvault.verification.service.OriginalWillIntakeService;
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

/**
 * Bản di chúc giấy gốc đã nhận cho một ca xác minh (PS-39, ST-13). Chỉ Staff đã nhận ca; thiếu role STAFF_EXECUTOR là
 * 403, ca không thuộc mình là 404. Không có API sửa hay xóa: bản ghi là chứng cứ.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/original-will-intakes")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class StaffOriginalWillController {

    private final OriginalWillIntakeService service;

    public StaffOriginalWillController(OriginalWillIntakeService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<OriginalWillIntakeResponse> record(
            @PathVariable UUID caseId,
            @Valid @RequestBody RecordOriginalWillRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        OriginalWillIntakeResponse created = service.record(caseId, principal, request);
        URI location = URI.create(
                "/api/v1/staff/verification-cases/" + caseId + "/original-will-intakes/" + created.id());
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping
    public List<OriginalWillIntakeResponse> list(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return service.list(caseId, principal);
    }

    @GetMapping("/{intakeId}")
    public OriginalWillIntakeResponse get(
            @PathVariable UUID caseId,
            @PathVariable UUID intakeId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return service.get(caseId, intakeId, principal);
    }
}
