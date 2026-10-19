package com.legacyvault.subscription.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.subscription.dto.AdminSubscriptionDtos.*;
import com.legacyvault.subscription.service.AdminSubscriptionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/subscriptions")
@PreAuthorize("hasRole('ADMIN')")
@Validated
public class AdminSubscriptionController {

    private final AdminSubscriptionService adminService;

    public AdminSubscriptionController(AdminSubscriptionService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/plans")
    public List<PlanSummaryDto> listPlans() {
        return adminService.listPlans();
    }

    @GetMapping("/plans/{planCode}")
    public PlanDetailDto getPlanDetail(@PathVariable String planCode) {
        return adminService.getPlanDetail(planCode);
    }

    @GetMapping("/plans/{planCode}/versions")
    public List<SubscriptionPlanVersionDto> listPlanVersions(@PathVariable String planCode) {
        return adminService.listPlanVersions(planCode);
    }

    @GetMapping("/plans/{planCode}/versions/{version}")
    public SubscriptionPlanVersionDto getPlanVersion(
            @PathVariable String planCode,
            @PathVariable int version
    ) {
        return adminService.getPlanVersion(planCode, version);
    }

    @PostMapping("/plans/{planCode}/versions")
    @ResponseStatus(HttpStatus.CREATED)
    public SubscriptionPlanVersionDto createDraft(
            @PathVariable String planCode,
            @Valid @RequestBody CreateDraftRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal,
            HttpServletRequest servletRequest
    ) {
        Long adminUserId = principal != null ? principal.userId() : 1L;
        String ipAddress = servletRequest != null ? servletRequest.getRemoteAddr() : "127.0.0.1";
        return adminService.createDraftVersion(planCode, request, adminUserId, ipAddress);
    }

    @PutMapping("/plans/{planCode}/versions/{version}")
    public SubscriptionPlanVersionDto updateDraft(
            @PathVariable String planCode,
            @PathVariable int version,
            @Valid @RequestBody UpdatePlanVersionRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal,
            HttpServletRequest servletRequest
    ) {
        Long adminUserId = principal != null ? principal.userId() : 1L;
        String ipAddress = servletRequest != null ? servletRequest.getRemoteAddr() : "127.0.0.1";
        return adminService.updateDraftVersion(planCode, version, request, adminUserId, ipAddress);
    }

    @PostMapping("/plans/{planCode}/versions/{version}/publish")
    public SubscriptionPlanVersionDto publishVersion(
            @PathVariable String planCode,
            @PathVariable int version,
            @AuthenticationPrincipal CustomUserPrincipal principal,
            HttpServletRequest servletRequest
    ) {
        Long adminUserId = principal != null ? principal.userId() : 1L;
        String ipAddress = servletRequest != null ? servletRequest.getRemoteAddr() : "127.0.0.1";
        return adminService.publishVersion(planCode, version, adminUserId, ipAddress);
    }

    @PostMapping("/plans/{planCode}/versions/{version}/deprecate")
    public SubscriptionPlanVersionDto deprecateVersion(
            @PathVariable String planCode,
            @PathVariable int version,
            @AuthenticationPrincipal CustomUserPrincipal principal,
            HttpServletRequest servletRequest
    ) {
        Long adminUserId = principal != null ? principal.userId() : 1L;
        String ipAddress = servletRequest != null ? servletRequest.getRemoteAddr() : "127.0.0.1";
        return adminService.deprecateVersion(planCode, version, adminUserId, ipAddress);
    }

    @GetMapping("/accounts")
    public AccountUsageLookupDto lookupAccount(@RequestParam("query") String query) {
        return adminService.lookupAccount(query);
    }

    @GetMapping("/transactions")
    public void lookupTransactions(@RequestParam(value = "query", required = false) String query) {
        adminService.lookupTransactions(query);
    }
}
