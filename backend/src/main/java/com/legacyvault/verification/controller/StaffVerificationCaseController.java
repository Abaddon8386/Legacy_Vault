
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

    @GetMapping
    public PageResponse<StaffVerificationCaseResponse> listCases(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return caseService.listCases(principal, status, page, size);
    }

    @GetMapping("/{caseId}")
    public StaffVerificationCaseResponse getCase(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return caseService.getCase(caseId, principal);
    }
}
