package com.legacyvault.subscription.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * DTO giao dịch thanh toán cho admin: cố ý dùng whitelist, không có URL checkout, payload của cổng, merchant, chữ ký hay idempotency key.
 */
public final class AdminPaymentDtos {
    /**
     * Lớp tiện ích, không khởi tạo.
     */
    private AdminPaymentDtos() {}
    /**
     * Một giao dịch thanh toán, trả bởi {@code GET /api/v1/admin/subscriptions/transactions[/{paymentId}]}.
     *
     * <ul>
     * <li>{@code paymentId}, {@code accountId}, {@code accountEmail} - đơn và tài khoản (public id)</li>
     * <li>{@code planCode}, {@code catalogVersion}, {@code amountVnd}, {@code currency}, {@code billingModel}, {@code limits} - snapshot gói lúc mua</li>
     * <li>{@code status} - trạng thái hiển thị (PENDING quá hạn được tính là EXPIRED); {@code persistedStatus} - trạng thái trong DB</li>
     * <li>{@code createdAt}, {@code expiresAt}, {@code completedAt} - các mốc thời gian</li>
     * <li>{@code gatewayReference} - mã giao dịch của VNPay; {@code checkoutReference} - mã đơn gửi cổng (payment id không dấu gạch)</li>
     * </ul>
     */
    public record Transaction(UUID paymentId, UUID accountId, String accountEmail,
            String planCode, int catalogVersion, long amountVnd, String currency, String billingModel,
            AdminSubscriptionDtos.PlanLimitsDto limits, String status, String persistedStatus,
            Instant createdAt, Instant expiresAt, Instant completedAt,
            String gatewayReference, String checkoutReference) {}
    /**
     * Bộ lọc tra cứu giao dịch (query, accountId, status, from, to, page, size) dùng giữa {@code AdminSubscriptionService} và {@code PaymentRepository.adminList}.
     */
    public record Filter(String query, UUID accountId, String status, Instant from, Instant to, int page, int size) {}
}
