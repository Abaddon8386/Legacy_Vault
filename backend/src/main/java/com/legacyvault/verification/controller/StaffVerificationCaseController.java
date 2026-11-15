
package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.verification.dto.StaffVerificationCaseResponse;
import com.legacyvault.verification.service.StaffVerificationCaseService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * API Staff xem và nhận (claim) ca xác minh. Chỉ STAFF_EXECUTOR; @Validated để ràng buộc page/size.
 */
@RestController
@Validated
@RequestMapping("/api/v1/staff/verification-cases")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class StaffVerificationCaseController {

    private final StaffVerificationCaseService caseService;

    public StaffVerificationCaseController(
            StaffVerificationCaseService caseService
    ) {
        this.caseService = caseService;
    }

    /**
     * Danh sách ca Staff được thấy: ca được giao cho mình hoặc ca OPEN chưa ai nhận.
     * @param status lọc trạng thái
     * @param query từ khóa tìm kiếm (Vault, chủ sở hữu, người thụ hưởng, mã ca)
     * @param size 1..100
     */
    @GetMapping
    public PageResponse<StaffVerificationCaseResponse> listCases(
            @RequestParam(required = false) String status,
            @RequestParam(name = "q", required = false) String query,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return caseService.listCases(principal, status, query, page, size);
    }

    /**
     * Xem một ca Staff được phép thấy.
     */
    @GetMapping("/{caseId}")
    public StaffVerificationCaseResponse getCase(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return caseService.getCase(caseId, principal);
    }

    /**
     * Staff nhận một ca OPEN chưa có người phụ trách.
     */
    @PostMapping("/{caseId}/claim")
    public StaffVerificationCaseResponse claimCase(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return caseService.claimCase(caseId, principal);
    }
}
