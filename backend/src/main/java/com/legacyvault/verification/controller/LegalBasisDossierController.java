
package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.dto.LegalBasisReviewResponse;
import com.legacyvault.verification.dto.RecordLegalBasisReviewRequest;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.BasisReclassificationService;
import com.legacyvault.verification.service.LegalBasisReviewService;
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
 * API hồ sơ căn cứ pháp lý phía Legal (ST-16, ST-20).
 * Chỉ LEGAL_VERIFIER được truy cập các endpoint của controller.
 */
@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalBasisDossierController {

    private final BasisClassificationService classification;
    private final BasisReclassificationService reclassification;
    private final BasisDossierViewService views;
    private final LegalBasisReviewService legalBasisReviewService;

    public LegalBasisDossierController(
            BasisClassificationService classification,
            BasisReclassificationService reclassification,
            BasisDossierViewService views,
            LegalBasisReviewService legalBasisReviewService) {
        this.classification = classification;
        this.reclassification = reclassification;
        this.views = views;
        this.legalBasisReviewService = legalBasisReviewService;
    }

    @PostMapping
    public ResponseEntity<BasisDossierResponse> classify(
            @PathVariable UUID caseId,
            @Valid @RequestBody ClassifyBasisRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {

        BasisDossierResponse created =
                classification.classify(caseId, principal, request);

        URI location = URI.create(
                "/api/v1/legal-verifications/verification-cases/"
                        + caseId + "/basis-dossier");

        return ResponseEntity.created(location).body(created);
    }

    /**
     * PS-43: Legal phân loại lại hồ sơ ON_HOLD khi đã có đủ chứng cứ.
     */
    @PostMapping("/reclassification")
    public BasisDossierResponse reclassify(
            @PathVariable UUID caseId,
            @Valid @RequestBody ClassifyBasisRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {

        return reclassification.reclassify(caseId, principal, request);
    }

    /**
     * ST-20 / PS-37: Ghi nhận Legal đã hoàn thành review hồ sơ căn cứ.
     * Người review được xác định từ principal, không lấy ID từ request.
     */
    @PostMapping("/review")
    public ResponseEntity<LegalBasisReviewResponse> recordReview(
            @PathVariable UUID caseId,
            @Valid @RequestBody RecordLegalBasisReviewRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {

        Long reviewerUserId =
                CustomUserPrincipal.requireUserId(principal);

        LegalBasisReviewResponse response =
                legalBasisReviewService.recordCompletedReviewByCasePublicId(
                        caseId,
                        reviewerUserId,
                        request.reason());

        return ResponseEntity.ok(response);
    }

    @GetMapping
    public BasisDossierResponse get(@PathVariable UUID caseId) {
        return views.forLegal(caseId);
    }
}
