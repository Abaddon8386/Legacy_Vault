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

/**
 * Thẩm định giấy tờ chứng tử phía Legal.
 * Phạm vi: {@code /api/v1/legal-verifications/death-documents}. Quyền: {@code ROLE_LEGAL_VERIFIER}.
 * Ủy quyền cho {@link LegalDeathVerificationService}.
 */
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
     *
     * {@code POST /api/v1/legal-verifications/death-documents/{deathDocumentPublicId}/decision}
     * Body {@link LegalDeathDecisionRequest}; trả {@link LegalDeathDecisionResponse}.
     *
     * @param deathDocumentPublicId mã công khai của giấy tờ chứng tử
     * @param request quyết định thẩm định
     * @param principal Legal đang đăng nhập
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
     *
     * {@code GET /api/v1/legal-verifications/death-documents/{deathDocumentPublicId}}
     * Trả {@link LegalDeathDocumentDetailResponse}.
     *
     * @param deathDocumentPublicId mã công khai của giấy tờ chứng tử
     */
    @GetMapping("/{deathDocumentPublicId}")
    public LegalDeathDocumentDetailResponse getDetail(
            @PathVariable UUID deathDocumentPublicId
    ) {
        return service.getDetail(deathDocumentPublicId);
    }

}