package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.BasisReclassificationService;
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
 * Hồ sơ căn cứ phân chia phía Legal (PS-41, ST-16). Chỉ LEGAL_VERIFIER: Legal phân loại nhánh và tạo hồ sơ; Staff và Owner
 * nhận 403. Không có API sửa hay xóa hồ sơ.
 */
@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalBasisDossierController {

    private final BasisClassificationService classification;
    private final BasisReclassificationService reclassification;
    private final BasisDossierViewService views;

    public LegalBasisDossierController(BasisClassificationService classification,
            BasisReclassificationService reclassification, BasisDossierViewService views) {
        this.classification = classification;
        this.reclassification = reclassification;
        this.views = views;
    }

    @PostMapping
    public ResponseEntity<BasisDossierResponse> classify(
            @PathVariable UUID caseId,
            @Valid @RequestBody ClassifyBasisRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        BasisDossierResponse created = classification.classify(caseId, principal, request);
        URI location = URI.create("/api/v1/legal-verifications/verification-cases/" + caseId + "/basis-dossier");
        return ResponseEntity.created(location).body(created);
    }

    /** PS-43: phân loại lại hồ sơ ON_HOLD sang NOTARIAL/COURT khi đã đủ chứng cứ (LV-HOLD-001). */
    @PostMapping("/reclassification")
    public BasisDossierResponse reclassify(
            @PathVariable UUID caseId,
            @Valid @RequestBody ClassifyBasisRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return reclassification.reclassify(caseId, principal, request);
    }

    @GetMapping
    public BasisDossierResponse get(@PathVariable UUID caseId) {
        return views.forLegal(caseId);
    }
}
