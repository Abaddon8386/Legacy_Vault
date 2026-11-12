
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
 * Danh sách và nhận (claim) ca xác minh của Staff.
 * Phạm vi: {@code /api/v1/staff/verification-cases}. Quyền: {@code ROLE_STAFF_EXECUTOR}.
 * Ủy quyền cho {@link StaffVerificationCaseService}.
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
     * {@code GET /api/v1/staff/verification-cases?status=&q=&page=0&size=20}
     * Danh sách ca có lọc trạng thái, tìm kiếm {@code q}, phân trang ({@code size} 1..100).
     *
     * @return {@code PageResponse} của {@link StaffVerificationCaseResponse}
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
     * {@code GET .../verification-cases/{caseId}}: chi tiết một ca của Staff.
     */
    @GetMapping("/{caseId}")
    public StaffVerificationCaseResponse getCase(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return caseService.getCase(caseId, principal);
    }

    /**
     * {@code POST .../verification-cases/{caseId}/claim}: Staff nhận ca để xử lý; trả ca sau khi nhận.
     */
    @PostMapping("/{caseId}/claim")
    public StaffVerificationCaseResponse claimCase(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return caseService.claimCase(caseId, principal);
    }
}
