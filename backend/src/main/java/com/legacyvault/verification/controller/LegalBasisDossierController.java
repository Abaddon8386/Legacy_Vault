
package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.dto.LegalBasisReviewResponse;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.dto.LegalApprovalResponse;
import com.legacyvault.verification.dto.RecordLegalBasisReviewRequest;
import com.legacyvault.verification.dto.CompleteLegalBasisReviewRequest;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.BasisReclassificationService;
import com.legacyvault.verification.service.LegalBasisReviewService;
import com.legacyvault.verification.service.DistributionWorkflowService;
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
    private final DistributionWorkflowService distribution;

    public LegalBasisDossierController(
            BasisClassificationService classification,
            BasisReclassificationService reclassification,
            BasisDossierViewService views,
            LegalBasisReviewService legalBasisReviewService,
            DistributionWorkflowService distribution) {
        this.classification = classification;
        this.reclassification = reclassification;
        this.views = views;
        this.legalBasisReviewService = legalBasisReviewService;
        this.distribution = distribution;
    }

    /**
     * ST-21: phê duyệt/từ chối đúng snapshot đã được Legal xem xét.
     *
     * {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/decision}
     * Body {@link LegalApprovalRequest}; ủy quyền {@code DistributionWorkflowService.decide}.
     *
     * @return {@link LegalApprovalResponse}
     */
    @PostMapping("/decision")
    public ResponseEntity<LegalApprovalResponse> decide(
            @PathVariable UUID caseId,
            @Valid @RequestBody LegalApprovalRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok(distribution.decide(caseId, principal, request));
    }

    /**
     * {@code POST .../basis-dossier}: Legal phân loại hồ sơ căn cứ lần đầu. Body {@link ClassifyBasisRequest};
     * gọi {@code BasisClassificationService.classify}. Trả 201 Created kèm {@link BasisDossierResponse}.
     */
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
     *
     * {@code POST .../basis-dossier/reclassification}. Body {@link ClassifyBasisRequest}; gọi
     * {@code BasisReclassificationService.reclassify}; trả {@link BasisDossierResponse}.
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
     *
     * {@code POST .../basis-dossier/review}. Body {@link CompleteLegalBasisReviewRequest}; id người review lấy
     * từ principal (qua {@code requireUserId}); gọi {@code LegalBasisReviewService.recordCompletedReviewByCasePublicId};
     * trả {@link LegalBasisReviewResponse}.
     */
    @PostMapping("/review")
    public ResponseEntity<LegalBasisReviewResponse> recordReview(
            @PathVariable UUID caseId,
            @Valid @RequestBody CompleteLegalBasisReviewRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {

        Long reviewerUserId =
                CustomUserPrincipal.requireUserId(principal);

        LegalBasisReviewResponse response =
                legalBasisReviewService.recordCompletedReviewByCasePublicId(
                        caseId,
                        reviewerUserId,
                        request);

        return ResponseEntity.ok(response);
    }

    /**
     * PS-37: Legal trả hồ sơ về Staff để bổ sung chứng cứ.
     *
     * {@code POST .../basis-dossier/request-supplementation}. Body {@link RecordLegalBasisReviewRequest}
     * (chỉ dùng {@code reason}); gọi {@code LegalBasisReviewService.requestSupplementationByCasePublicId};
     * trả {@link LegalBasisReviewResponse}.
     */
    @PostMapping("/request-supplementation")
    public ResponseEntity<LegalBasisReviewResponse> requestSupplementation(
            @PathVariable UUID caseId,
            @Valid @RequestBody RecordLegalBasisReviewRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {

        Long reviewerUserId = CustomUserPrincipal.requireUserId(principal);

        LegalBasisReviewResponse response =
                legalBasisReviewService.requestSupplementationByCasePublicId(
                        caseId,
                        reviewerUserId,
                        request.reason());

        return ResponseEntity.ok(response);
    }

    /**
     * {@code GET .../basis-dossier}: xem hồ sơ căn cứ phía Legal qua {@code BasisDossierViewService.forLegal};
     * trả {@link BasisDossierResponse}.
     */
    @GetMapping
    public BasisDossierResponse get(@PathVariable UUID caseId) {
        return views.forLegal(caseId);
    }
}
