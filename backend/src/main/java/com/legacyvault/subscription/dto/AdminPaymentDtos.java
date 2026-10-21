package com.legacyvault.subscription.dto;

import java.time.Instant;
import java.util.UUID;

/** Deliberate whitelist: no checkout URL, provider payload, merchant, signature or idempotency key. */
public final class AdminPaymentDtos {
    private AdminPaymentDtos() {}
    public record Transaction(UUID paymentId, UUID accountId, String accountEmail,
            String planCode, int catalogVersion, long amountVnd, String currency, String billingModel,
            AdminSubscriptionDtos.PlanLimitsDto limits, String status, String persistedStatus,
            Instant createdAt, Instant expiresAt, Instant completedAt,
            String gatewayReference, String checkoutReference) {}
    public record Filter(String query, UUID accountId, String status, Instant from, Instant to, int page, int size) {}
}
