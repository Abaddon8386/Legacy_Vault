package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import jakarta.validation.constraints.*;

/**
 * Nhóm DTO của API người giám hộ ({@code GuardianController}).
 */
public final class GuardianDtos {
    /**
     * Lớp tiện ích, không cho khởi tạo.
     */
    private GuardianDtos() {}
    /**
     * Body của {@code PUT .../guardian}: {@code expectedRevision} (phiên bản client đang thấy, khóa lạc quan), {@code fullName} (tối đa 150),
     * {@code relationship} (tối đa 100), {@code email} (tối đa 254) và {@code phone} (tối đa 20); cần ít nhất email hoặc phone.
     */
    public record UpsertRequest(@NotNull(message="validation.NotNull") @Min(value=0, message="validation.Min") Long expectedRevision,
            @NotBlank(message="validation.NotBlank") @Size(message="validation.Size", max=150) String fullName,
            @NotBlank(message="validation.NotBlank") @Size(message="validation.Size", max=100) String relationship,
            @Email(message="validation.Email") @Size(message="validation.Size", max=254) String email,
            @Size(message="validation.Size", max=20) String phone) {}
    /**
     * Body của {@code POST .../guardian/revoke}: {@code expectedRevision} là phiên bản client đang thấy (khóa lạc quan).
     */
    public record RevokeRequest(@NotNull(message="validation.NotNull") @Min(value=0, message="validation.Min") Long expectedRevision) {}
    /**
     * Một bản ghi người giám hộ: {@code id}, {@code revision}, {@code fullName}, {@code relationship}, {@code email}, {@code phone},
     * {@code createdAt}, {@code endedAt} (null nếu còn hiệu lực) và {@code endReason} ({@code REPLACED} hoặc {@code REVOKED}).
     */
    public record Guardian(UUID id, long revision, String fullName, String relationship,
            String email, String phone, Instant createdAt, Instant endedAt, String endReason) {}
    /**
     * Ngữ cảnh người giám hộ: {@code beneficiaryId}, {@code revision} hiện tại, {@code evaluatedOn} ngày tính tuổi, {@code timeZone} múi giờ,
     * {@code ageStatus} ({@code MINOR}, {@code ADULT} hoặc {@code UNKNOWN}), {@code guardianRecommended} (đề xuất có người giám hộ),
     * {@code warningCode} (ví dụ {@code BENEFICIARY_DOB_REQUIRED}, {@code BENEFICIARY_GUARDIAN_RECOMMENDED}) và {@code guardian} hiện tại (có thể null).
     */
    public record Context(UUID beneficiaryId, long revision, LocalDate evaluatedOn, String timeZone,
            String ageStatus, boolean guardianRecommended, String warningCode, Guardian guardian) {}
}
