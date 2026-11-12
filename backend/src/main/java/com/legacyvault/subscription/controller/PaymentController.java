package com.legacyvault.subscription.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.subscription.service.PaymentService;
import com.legacyvault.subscription.service.PaymentReconciliationService;
import com.legacyvault.subscription.service.PaymentService.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

/**
 * Controller thanh toán nâng cấp gói qua VNPay (sandbox) cho Owner.
 *
 * <ul>
 * <li>{@code POST /api/v1/subscriptions/me/payments} - tạo đơn thanh toán (role VAULT_OWNER)</li>
 * <li>{@code GET /api/v1/subscriptions/me/payments/{id}} - xem / đối soát trạng thái đơn (role VAULT_OWNER)</li>
 * <li>{@code POST /api/v1/subscriptions/me/payments/{id}/return-failure} - báo trình duyệt trả về thất bại (role VAULT_OWNER)</li>
 * <li>{@code GET /api/v1/payments/vnpay/ipn} - callback IPN server-to-server của VNPay (không cần đăng nhập, xác thực bằng chữ ký)</li>
 * </ul>
 */
@RestController
public class PaymentController {
    /**
     * Logger; chỉ ghi cảnh báo chung, không bao giờ log query hay bí mật của VNPay.
     */
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(PaymentController.class);
    /**
     * Service tạo / xác nhận thanh toán.
     */
    private final PaymentService payments;
    /**
     * Service đối soát giao dịch bị lỡ IPN qua QueryDR.
     */
    private final PaymentReconciliationService reconciliation;
    /**
     * Khởi tạo controller với {@link PaymentService} và {@link PaymentReconciliationService}.
     */
    public PaymentController(PaymentService payments,PaymentReconciliationService reconciliation) {
        this.payments=payments; this.reconciliation=reconciliation;
    }
    /**
     * {@code POST /api/v1/subscriptions/me/payments} - tạo đơn thanh toán PENDING (hiệu lực 15 phút) và trả URL checkout VNPay. Body {@link CheckoutRequest}
     * (planCode, catalogVersion, idempotencyKey). Cùng idempotencyKey thì trả lại đơn cũ.
     *
     * @param user Owner đang đăng nhập
     * @param servlet dùng lấy IP khách
     * @return {@link PaymentView} kèm {@code checkoutUrl}
     */
    @PostMapping("/api/v1/subscriptions/me/payments")
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public PaymentView create(@AuthenticationPrincipal CustomUserPrincipal user,@Valid @RequestBody CheckoutRequest request,HttpServletRequest servlet) {
        return payments.create(CustomUserPrincipal.requireUserId(user),request,servlet.getRemoteAddr());
    }
    /**
     * {@code GET /api/v1/subscriptions/me/payments/{id}} - đọc trạng thái đơn của chính Owner; nếu đơn còn PENDING thì thử đối soát QueryDR qua
     * {@link PaymentReconciliationService#read}.
     *
     * @param id payment id
     * @return {@link PaymentView}; RESOURCE_NOT_FOUND nếu không phải của Owner
     */
    @GetMapping("/api/v1/subscriptions/me/payments/{id}")
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public PaymentView read(@AuthenticationPrincipal CustomUserPrincipal user,@PathVariable UUID id) {
        return reconciliation.read(CustomUserPrincipal.requireUserId(user),id);
    }
    /**
     * {@code POST /api/v1/subscriptions/me/payments/{id}/return-failure} - FE gửi lại query đã ký của VNPay khi người dùng hủy / thất bại để đóng đơn ngay và cho thử lại.
     * Trình duyệt không bao giờ cấp được gói: thành công chỉ đến từ IPN hoặc QueryDR.
     *
     * @param query query string VNPay trả về
     * @return {@link PaymentView} sau khi cập nhật
     */
    @PostMapping("/api/v1/subscriptions/me/payments/{id}/return-failure")
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public PaymentView returnFailure(@AuthenticationPrincipal CustomUserPrincipal user,@PathVariable UUID id,
            @RequestParam MultiValueMap<String,String> query) {
        long owner=CustomUserPrincipal.requireUserId(user);
        payments.recordReturnFailure(owner,id,query);
        return payments.read(owner,id);
    }
    /**
     * {@code GET /api/v1/payments/vnpay/ipn} - IPN của VNPay. Trả JSON {@code RspCode}/{@code Message}. Bắt lỗi bên ngoài proxy transactional:
     * giao dịch đã rollback rồi mới báo {@code 99 Retry later} để VNPay gọi lại.
     *
     * @param query tham số {@code vnp_*} có chữ ký
     * @return {@link IpnResult}
     */
    @GetMapping("/api/v1/payments/vnpay/ipn")
    public IpnResult ipn(@RequestParam MultiValueMap<String,String> query) {
        // Catch outside transactional proxy: failures have rolled back before telling VNPay to retry.
        try { return payments.ipn(query); }
        catch(RuntimeException e) {
            LOG.warn("VNPay IPN transaction failed; rolled back and awaiting retry");
            return new IpnResult("99","Retry later");
        }
    }
}
