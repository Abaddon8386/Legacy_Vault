package com.legacyvault.subscription.controller;

import com.legacyvault.common.api.PageEnvelope;
import com.legacyvault.subscription.dto.AdminPaymentDtos.Transaction;
import java.util.UUID;
import java.time.Instant;

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

/**
 * Controller quản trị gói đăng ký (subscription plan) và giao dịch thanh toán. Base path {@code /api/v1/admin/subscriptions};
 * yêu cầu role {@code ADMIN}. Mọi nghiệp vụ nằm ở {@link AdminSubscriptionService}.
 *
 * <p>Nhóm plan: xem danh sách / chi tiết / các version, tạo bản nháp, sửa nháp, publish, deprecate. Nhóm tra cứu: tài khoản và giao dịch.
 * Lưu ý: nếu không có principal thì dùng admin id 1 và IP 127.0.0.1 (chỉ xảy ra trong test).
 */
@RestController
@RequestMapping("/api/v1/admin/subscriptions")
@PreAuthorize("hasRole('ADMIN')")
@Validated
public class AdminSubscriptionController {

    /**
     * Service nghiệp vụ quản trị gói đăng ký.
     */
    private final AdminSubscriptionService adminService;

    /**
     * Khởi tạo controller với {@link AdminSubscriptionService}.
     */
    public AdminSubscriptionController(AdminSubscriptionService adminService) {
        this.adminService = adminService;
    }

    /**
     * {@code GET /api/v1/admin/subscriptions/plans} - tóm tắt 3 gói BASIC, STANDARD, EXTENDED (version đang PUBLISHED, bản nháp, số version).
     *
     * @return danh sách {@link PlanSummaryDto}
     */
    @GetMapping("/plans")
    public List<PlanSummaryDto> listPlans() {
        return adminService.listPlans();
    }

    /**
     * {@code GET /api/v1/admin/subscriptions/plans/{planCode}} - chi tiết một gói kèm mọi version.
     *
     * @param planCode mã gói (không phân biệt hoa thường)
     * @return {@link PlanDetailDto}; PLAN_VERSION_NOT_FOUND nếu mã không hợp lệ
     */
    @GetMapping("/plans/{planCode}")
    public PlanDetailDto getPlanDetail(@PathVariable String planCode) {
        return adminService.getPlanDetail(planCode);
    }

    /**
     * {@code GET /api/v1/admin/subscriptions/plans/{planCode}/versions} - danh sách version của gói, mới nhất trước.
     *
     * @return danh sách {@link SubscriptionPlanVersionDto}
     */
    @GetMapping("/plans/{planCode}/versions")
    public List<SubscriptionPlanVersionDto> listPlanVersions(@PathVariable String planCode) {
        return adminService.listPlanVersions(planCode);
    }

    /**
     * {@code GET /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}} - chi tiết một version.
     *
     * @return {@link SubscriptionPlanVersionDto}; PLAN_VERSION_NOT_FOUND nếu không có
     */
    @GetMapping("/plans/{planCode}/versions/{version}")
    public SubscriptionPlanVersionDto getPlanVersion(
            @PathVariable String planCode,
            @PathVariable int version
    ) {
        return adminService.getPlanVersion(planCode, version);
    }

    /**
     * {@code POST /api/v1/admin/subscriptions/plans/{planCode}/versions} - tạo bản nháp (DRAFT) mới sao chép từ một version nguồn. Body {@link CreateDraftRequest}.
     * Trả 201 Created. Mỗi gói chỉ có một bản nháp; trùng -> PLAN_VERSION_ALREADY_EXISTS.
     *
     * @param principal admin đang đăng nhập
     * @param servletRequest dùng lấy IP ghi audit
     */
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

    /**
     * {@code PUT /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}} - sửa bản nháp. Body {@link UpdatePlanVersionRequest} (kèm {@code concurrencyToken}).
     * Chỉ sửa được DRAFT (PLAN_VERSION_NOT_EDITABLE); token lệch -> PLAN_VERSION_CONFLICT.
     */
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

    /**
     * {@code POST /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}/publish} - công bố bản nháp: version PUBLISHED cũ chuyển DEPRECATED và
     * bảng {@code subscription_plans} được đồng bộ giá / giới hạn mới.
     */
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

    /**
     * {@code POST /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}/deprecate} - ngừng một version đã công bố (không áp dụng cho BASIC);
     * gói bị đánh dấu không còn khả dụng trong catalog.
     */
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

    /**
     * {@code GET /api/v1/admin/subscriptions/accounts?query=} - tra cứu mức sử dụng và gói hiệu lực của một tài khoản theo id số, email hoặc UUID công khai.
     *
     * @param query chuỗi tra cứu
     * @return {@link AccountUsageLookupDto}; RESOURCE_NOT_FOUND nếu không thấy
     */
    @GetMapping("/accounts")
    public AccountUsageLookupDto lookupAccount(@RequestParam("query") String query) {
        return adminService.lookupAccount(query);
    }

    /**
     * {@code GET /api/v1/admin/subscriptions/transactions} - tra cứu giao dịch thanh toán có phân trang.
     *
     * @param query payment id, account id, mã giao dịch cổng hoặc email
     * @param accountId lọc theo tài khoản
     * @param status PENDING, SUCCEEDED, FAILED hoặc EXPIRED
     * @param from thời điểm tạo từ (bao gồm)
     * @param to thời điểm tạo đến (không bao gồm)
     * @param page trang từ 0
     * @param size kích thước trang 1..100
     * @return {@link PageEnvelope} các giao dịch
     */
    @GetMapping("/transactions")
    public PageEnvelope<Transaction> lookupTransactions(
            @RequestParam(required=false) String query,
            @RequestParam(required=false) UUID accountId,
            @RequestParam(required=false) String status,
            @RequestParam(required=false) Instant from,
            @RequestParam(required=false) Instant to,
            @RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size) {
        return adminService.lookupTransactions(query,accountId,status,from,to,page,size);
    }

    /**
     * {@code GET /api/v1/admin/subscriptions/transactions/{paymentId}} - chi tiết một giao dịch (không lộ URL checkout, chữ ký hay payload của cổng).
     *
     * @return {@link com.legacyvault.subscription.dto.AdminPaymentDtos.Transaction}
     */
    @GetMapping("/transactions/{paymentId}")
    public Transaction transactionDetail(@PathVariable UUID paymentId) {
        return adminService.transactionDetail(paymentId);
    }
}
