package com.legacyvault.subscription.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import com.legacyvault.subscription.service.OwnerQuotaService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import jakarta.validation.Valid;
import com.legacyvault.subscription.service.SubscriptionUpgradeService;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

/**
 * Controller gói đăng ký phía Owner (role {@code VAULT_OWNER}): catalog gói, gói hiệu lực + mức sử dụng, báo giá nâng cấp.
 *
 * <ul>
 * <li>{@code GET /api/v1/subscription-plans}</li>
 * <li>{@code GET /api/v1/subscriptions/me}</li>
 * <li>{@code POST /api/v1/subscriptions/me/upgrade-quote}</li>
 * <li>{@code POST /api/v1/subscriptions/me/upgrade} (hiện luôn từ chối, thanh toán đi qua {@code PaymentController})</li>
 * </ul>
 */
@RestController
@PreAuthorize("hasRole('VAULT_OWNER')")
public class SubscriptionController {
    /**
     * Cung cấp catalog và gói hiệu lực + mức dùng.
     */
    private final OwnerQuotaService quotas;
    /**
     * Báo giá và (vô hiệu) nâng cấp trực tiếp.
     */
    private final SubscriptionUpgradeService upgrades;
    /**
     * Khởi tạo controller với {@link OwnerQuotaService} và {@link SubscriptionUpgradeService}.
     */
    public SubscriptionController(OwnerQuotaService quotas, SubscriptionUpgradeService upgrades) {
        this.quotas = quotas; this.upgrades = upgrades;
    }
    /**
     * {@code POST /api/v1/subscriptions/me/upgrade} - nâng cấp trực tiếp không qua thanh toán: luôn trả lỗi SUBSCRIPTION_UPGRADE_UNAVAILABLE
     * (quyền chỉ được cấp qua thanh toán VNPay đã xác minh).
     *
     * @return không bao giờ thành công
     */
    @PostMapping("/api/v1/subscriptions/me/upgrade")
    public UpgradeResponse upgrade(@AuthenticationPrincipal CustomUserPrincipal principal,
            @Valid @RequestBody UpgradeRequest request) {
        return upgrades.upgrade(CustomUserPrincipal.requireUserId(principal), request);
    }

    /**
     * {@code GET /api/v1/subscription-plans} - catalog các gói đang khả dụng, sắp theo giới hạn số Asset tăng dần.
     *
     * @return danh sách {@link Plan}
     */
    @GetMapping("/api/v1/subscription-plans")
    public List<Plan> catalog() { return quotas.catalog(); }

    /**
     * {@code POST /api/v1/subscriptions/me/upgrade-quote} - báo giá nâng cấp lên gói đích (chỉ thông tin, không cấp quyền).
     * Body {@link UpgradeRequest}.
     *
     * @return {@link UpgradeQuote}
     */
    @PostMapping("/api/v1/subscriptions/me/upgrade-quote")
    public UpgradeQuote quote(@AuthenticationPrincipal CustomUserPrincipal principal,
            @Valid @RequestBody UpgradeRequest request) {
        return upgrades.quote(CustomUserPrincipal.requireUserId(principal), request);
    }

    /**
     * {@code GET /api/v1/subscriptions/me} - gói hiệu lực của Owner, mức sử dụng (Asset, byte, di chúc), cờ vượt quota và đã có Vault chưa.
     *
     * @return {@link Current}
     */
    @GetMapping("/api/v1/subscriptions/me")
    public Current current(@AuthenticationPrincipal CustomUserPrincipal principal) {
        return quotas.current(CustomUserPrincipal.requireUserId(principal));
    }
}
