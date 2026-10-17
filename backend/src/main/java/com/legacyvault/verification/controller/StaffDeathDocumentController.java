package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.DeathDocumentRecordResponse;
import com.legacyvault.verification.dto.RecordDeathDocumentRequest;
import com.legacyvault.verification.service.DeathDocumentIntakeService;
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
 * Giấy tờ khai tử đã nhận cho một ca xác minh (PS-38, ST-11). Chỉ Staff đã nhận ca; thiếu role STAFF_EXECUTOR là 403,
 * ca không thuộc mình là 404. Không có API sửa hay xóa: bản ghi là chứng cứ.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/death-documents")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class StaffDeathDocumentController {

    private final DeathDocumentIntakeService service;

    public StaffDeathDocumentController(DeathDocumentIntakeService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<DeathDocumentRecordResponse> record(
            @PathVariable UUID caseId,
            @Valid @RequestBody RecordDeathDocumentRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        DeathDocumentRecordResponse created = service.record(caseId, principal, request);
        URI location = URI.create("/api/v1/staff/verification-cases/" + caseId + "/death-documents/" + created.id());
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping
    public List<DeathDocumentRecordResponse> list(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return service.list(caseId, principal);
    }

    @GetMapping("/{recordId}")
    public DeathDocumentRecordResponse get(
            @PathVariable UUID caseId,
            @PathVariable UUID recordId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return service.get(caseId, recordId, principal);
    }
}
