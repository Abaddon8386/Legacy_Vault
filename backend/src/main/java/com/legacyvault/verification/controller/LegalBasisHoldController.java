package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.service.LegalBasisHoldService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

/**
 * Tạm giữ (ON_HOLD) hồ sơ căn cứ pháp lý.
 * Phạm vi: {@code /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/hold}.
 * Quyền: {@code ROLE_LEGAL_VERIFIER}. Ủy quyền cho {@link LegalBasisHoldService}.
 */
@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/hold")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalBasisHoldController {
    private final LegalBasisHoldService service;
    public LegalBasisHoldController(LegalBasisHoldService service) { this.service = service; }
    /**
     * {@code POST .../basis-dossier/hold}: đặt hồ sơ ở trạng thái giữ. Body {@link HoldBasisRequest};
     * trả {@link BasisDossierResponse} sau khi cập nhật.
     */
    @PostMapping
    public BasisDossierResponse hold(@PathVariable UUID caseId, @Valid @RequestBody HoldBasisRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return service.hold(caseId, principal, request);
    }
}
