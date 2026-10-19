package com.legacyvault.subscription.dto;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;

public class AdminSubscriptionDtos {

    public record PlanLimitsDto(
        long assetCount,
        long storageBytes,
        long fileBytes
    ) {}

    public record PlanSummaryDto(
        String planCode,
        String nameVi,
        String nameEn,
        int activeVersion,
        long activePriceVnd,
        String activeBillingModel,
        String activeStatus,
        boolean hasDraft,
        Integer draftVersion,
        int totalVersions,
        PlanLimitsDto limits
    ) {}

    public record SubscriptionPlanVersionDto(
        Long id,
        String planCode,
        int version,
        String status,
        String nameVi,
        String nameEn,
        String descriptionVi,
        String descriptionEn,
        long purchasePriceVnd,
        String billingModel,
        long assetLimit,
        long storageBytesLimit,
        long fileBytesLimit,
        Long concurrencyToken,
        String changeNotes,
        Instant publishedAt,
        Long publishedByUserId,
        Instant createdAt,
        Instant updatedAt,
        Long legacyMonthlyPriceVnd
    ) {}

    public record PlanDetailDto(
        String planCode,
        String nameVi,
        String nameEn,
        int activeVersion,
        List<SubscriptionPlanVersionDto> versions
    ) {}

    public record CreateDraftRequest(
        @NotNull(message = "sourceVersionId is required")
        Long sourceVersionId,

        @Size(max = 500, message = "changeNotes must not exceed 500 characters")
        String changeNotes
    ) {}

    public record UpdatePlanVersionRequest(
        @NotBlank(message = "nameVi is required")
        @Size(min = 1, max = 100, message = "nameVi must be between 1 and 100 characters")
        String nameVi,

        @NotBlank(message = "nameEn is required")
        @Size(min = 1, max = 100, message = "nameEn must be between 1 and 100 characters")
        String nameEn,

        @Size(max = 500, message = "descriptionVi must not exceed 500 characters")
        String descriptionVi,

        @Size(max = 500, message = "descriptionEn must not exceed 500 characters")
        String descriptionEn,

        @NotNull(message = "purchasePriceVnd is required")
        @Min(value = 0, message = "purchasePriceVnd must be at least 0")
        Long purchasePriceVnd,

        @NotBlank(message = "billingModel is required")
        @Pattern(regexp = "LIFETIME", message = "billingModel must be LIFETIME")
        String billingModel,

        @NotNull(message = "assetLimit is required")
        @Min(value = 1, message = "assetLimit must be at least 1")
        Long assetLimit,

        @NotNull(message = "storageBytesLimit is required")
        @Min(value = 10485760, message = "storageBytesLimit must be at least 10 MB (10485760 bytes)")
        Long storageBytesLimit,

        @NotNull(message = "fileBytesLimit is required")
        @Min(value = 10485760, message = "fileBytesLimit must be exactly 10 MB (10485760 bytes)")
        @Max(value = 10485760, message = "fileBytesLimit must be exactly 10 MB (10485760 bytes)")
        Long fileBytesLimit,

        @NotNull(message = "concurrencyToken is required for concurrency control")
        Long concurrencyToken,

        @Size(max = 500, message = "changeNotes must not exceed 500 characters")
        String changeNotes
    ) {}

    public record AccountUsageLookupDto(
        String accountId,
        String username,
        String email,
        String role,
        String effectivePlanCode,
        String effectivePlanName,
        String effectivePlanStatus,
        String entitlementStatus,
        Instant effectiveSince,
        Instant effectiveUntil,
        String billingModel,
        long assetCount,
        long assetLimit,
        long storageBytes,
        long storageBytesLimit,
        long maxFileBytes,
        long maxFileBytesLimit,
        boolean hasVault,
        String vaultId
    ) {}
}
