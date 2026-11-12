package com.legacyvault.subscription.dto;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;

/**
 * Nhóm DTO của API quản trị gói đăng ký ({@code /api/v1/admin/subscriptions}).
 */
public class AdminSubscriptionDtos {

    /**
     * Giới hạn của gói: số Asset, tổng dung lượng lưu trữ (byte) và dung lượng tối đa mỗi file (byte).
     */
    public record PlanLimitsDto(
        long assetCount,
        long storageBytes,
        long fileBytes
    ) {}

    /**
     * Tóm tắt một gói cho danh sách admin: tên vi/en, version đang PUBLISHED ({@code activeVersion}, 0 nếu chưa có), giá, mô hình thu phí, trạng thái, có bản nháp không ({@code hasDraft}/{@code draftVersion}), tổng số version và giới hạn.
     */
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

    /**
     * Một version của gói (bảng {@code subscription_plan_versions}).
     *
     * <ul>
     * <li>{@code id}, {@code planCode}, {@code version}, {@code status} (DRAFT, PUBLISHED, DEPRECATED)</li>
     * <li>{@code nameVi}, {@code nameEn}, {@code descriptionVi}, {@code descriptionEn} - nội dung hiển thị</li>
     * <li>{@code purchasePriceVnd}, {@code billingModel} - giá mua một lần (LIFETIME)</li>
     * <li>{@code assetLimit}, {@code storageBytesLimit}, {@code fileBytesLimit} - giới hạn</li>
     * <li>{@code concurrencyToken} - token khóa lạc quan, phải gửi lại khi sửa</li>
     * <li>{@code changeNotes}, {@code publishedAt}, {@code publishedByUserId}, {@code createdAt}, {@code updatedAt}</li>
     * <li>{@code legacyMonthlyPriceVnd} - giá tháng cũ, chỉ có với dữ liệu MONTHLY legacy</li>
     * </ul>
     */
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

    /**
     * Chi tiết gói: mã, tên, version đang hoạt động và toàn bộ {@link SubscriptionPlanVersionDto}.
     */
    public record PlanDetailDto(
        String planCode,
        String nameVi,
        String nameEn,
        int activeVersion,
        List<SubscriptionPlanVersionDto> versions
    ) {}

    /**
     * Body tạo bản nháp: {@code sourceVersionId} (id version nguồn, bắt buộc) và {@code changeNotes} (tối đa 500 ký tự).
     */
    public record CreateDraftRequest(
        @NotNull(message = "sourceVersionId is required")
        Long sourceVersionId,

        @Size(max = 500, message = "changeNotes must not exceed 500 characters")
        String changeNotes
    ) {}

    /**
     * Body sửa bản nháp. Ràng buộc: tên vi/en bắt buộc (<= 100 ký tự), mô tả <= 500, giá >= 0, {@code billingModel} chỉ {@code LIFETIME},
     * {@code assetLimit} >= 1, {@code storageBytesLimit} >= 10 MB, {@code fileBytesLimit} đúng 10 MB, {@code concurrencyToken} bắt buộc (khớp token hiện tại), {@code changeNotes} <= 500.
     */
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

    /**
     * Kết quả tra cứu tài khoản: định danh (accountId = public UUID, username = họ tên, email, {@code role} - thực tế service gán trạng thái tài khoản, mặc định ACTIVE), gói hiệu lực ({@code effectivePlanCode/Name/Status},
     * {@code entitlementStatus}, {@code effectiveSince/Until}, {@code billingModel}), mức dùng ({@code assetCount}, {@code storageBytes}) so với giới hạn
     * ({@code assetLimit}, {@code storageBytesLimit}, {@code maxFileBytes}, {@code maxFileBytesLimit}; hai trường file hiện cùng nhận giới hạn dung lượng mỗi file của gói) và thông tin Vault ({@code hasVault}, {@code vaultId}).
     */
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
