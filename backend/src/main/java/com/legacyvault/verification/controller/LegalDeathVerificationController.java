package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.LegalDeathDecisionRequest;
import com.legacyvault.verification.dto.LegalDeathDecisionResponse;
import com.legacyvault.verification.dto.LegalDeathDocumentDetailResponse;
import com.legacyvault.verification.service.LegalDeathVerificationService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/legal-verifications/death-documents")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalDeathVerificationController {

    private final LegalDeathVerificationService service;

    public LegalDeathVerificationController(
            LegalDeathVerificationService service
    ) {
        this.service = service;
    }

    /**
     * Xử lý quyết định thẩm định giấy tờ chứng tử.
     *
     * Vị trí: class LegalDeathVerificationController,
     * package com.legacyvault.verification.controller.
     */
    @PostMapping("/{deathDocumentPublicId}/decision")
    public LegalDeathDecisionResponse decide(
            @PathVariable UUID deathDocumentPublicId,
            @Valid @RequestBody LegalDeathDecisionRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return service.decide(deathDocumentPublicId, request, principal);
    }


    /**
     * Đọc chi tiết hồ sơ chứng tử và kết quả thẩm định.
     *
     * Package: com.legacyvault.verification.controller
     * Class: LegalDeathVerificationController
     * Vị trí: ngay sau phương thức decide().
     */
    @GetMapping("/{deathDocumentPublicId}")
    public LegalDeathDocumentDetailResponse getDetail(
            @PathVariable UUID deathDocumentPublicId
    ) {
        return service.getDetail(deathDocumentPublicId);
    }

}