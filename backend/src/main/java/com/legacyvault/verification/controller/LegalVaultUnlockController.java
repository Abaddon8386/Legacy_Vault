package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.LegalVaultUnlockResponse;
import com.legacyvault.verification.service.DistributionWorkflowService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Mở khóa vault (unlock) sau khi Legal đã phê duyệt đủ điều kiện.
 * Phạm vi: {@code /api/v1/legal-verifications/verification-cases/{caseId}/unlock}.
 * Quyền: {@code ROLE_LEGAL_VERIFIER}. Ủy quyền cho {@code DistributionWorkflowService.unlock}.
 */
@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases/{caseId}/unlock")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalVaultUnlockController {
    private final DistributionWorkflowService service;

    public LegalVaultUnlockController(DistributionWorkflowService service) {
        this.service = service;
    }

    /**
     * {@code POST .../verification-cases/{caseId}/unlock}: mở khóa vault của ca.
     *
     * @return {@link LegalVaultUnlockResponse}
     */
    @PostMapping
    public LegalVaultUnlockResponse unlock(@PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return service.unlock(caseId, principal);
    }
}
