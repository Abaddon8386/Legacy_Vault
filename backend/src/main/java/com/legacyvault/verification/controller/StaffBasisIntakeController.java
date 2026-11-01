package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.dto.BasisIntakeMetadata;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.DistributionWorkflowService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.util.UUID;

/**
 * Staff tiếp nhận văn bản căn cứ vào hồ sơ do Legal tạo (PS-41, ST-18). Chỉ STAFF_EXECUTOR đã nhận ca; ca không thuộc mình
 * là 404. Phần {@code metadata} là JSON, phần {@code file} là bản số hóa (PDF/JPEG/PNG).
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/basis-dossier")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class StaffBasisIntakeController {

    private final DistributionWorkflowService distribution;
    private final BasisDossierViewService views;

    public StaffBasisIntakeController(DistributionWorkflowService distribution, BasisDossierViewService views) {
        this.distribution = distribution;
        this.views = views;
    }

    /** Hai phần không bắt buộc ở tầng binding để thiếu phần nào cũng trả 400 VALIDATION_FAILED (service kiểm tra). */
    @PostMapping(path = "/versions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<BasisDossierResponse> receive(
            @PathVariable UUID caseId,
            @RequestPart(name = "metadata", required = false) @Valid BasisIntakeMetadata metadata,
            @RequestPart(name = "file", required = false) MultipartFile file,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        BasisDossierResponse updated = distribution.receive(caseId, principal, metadata, file);
        URI location = URI.create("/api/v1/staff/verification-cases/" + caseId + "/basis-dossier");
        return ResponseEntity.created(location).body(updated);
    }

    /** ST-19: chuyển đúng phiên bản (chỉ phiên bản mới nhất) cho Legal. Phiên bản cũ trả 409 BASIS_VERSION_STALE. */
    @PostMapping("/versions/{version}/forward")
    public BasisDossierResponse forward(
            @PathVariable UUID caseId,
            @PathVariable @Min(1) int version,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return distribution.forward(caseId, version, principal);
    }

    @GetMapping
    public BasisDossierResponse get(@PathVariable UUID caseId, @AuthenticationPrincipal CustomUserPrincipal principal) {
        return views.forStaff(caseId, principal);
    }
}
