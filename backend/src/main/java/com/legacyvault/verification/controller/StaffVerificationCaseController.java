
package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.verification.dto.StaffVerificationCaseResponse;
import com.legacyvault.verification.service.StaffVerificationCaseService;
import com.legacyvault.verification.service.StaffCaseWorkContextService;
import com.legacyvault.verification.dto.StaffCaseWorkContextResponse;
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
    private final StaffCaseWorkContextService workContextService;

    public StaffVerificationCaseController(
            StaffVerificationCaseService caseService,
            StaffCaseWorkContextService workContextService
    ) {
        this.caseService = caseService;
        this.workContextService = workContextService;
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

    /** PS-93 read context for assigned cases and OPEN cases currently visible in the claim queue. */
    @GetMapping("/{caseId}/work-context")
    public StaffCaseWorkContextResponse getWorkContext(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return workContextService.get(caseId, principal);
    }

    @PostMapping("/{caseId}/claim")
    public StaffVerificationCaseResponse claimCase(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return caseService.claimCase(caseId, principal);
    }
}
