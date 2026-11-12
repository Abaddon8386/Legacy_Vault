package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Staff ghi nhận đã nhận giấy tờ khai tử vật lý (ST-11, LV-DEATH-002). Chỉ metadata; không có file, không gọi VNeID.
 * Người nhận và thời điểm nhận do server lấy từ người đăng nhập và đồng hồ hệ thống, không nhận từ request.
 *
 * Body của {@code POST /api/v1/staff/verification-cases/{caseId}/death-documents}.
 *
 * Các trường:
 * - {@code documentType}: DEATH_CERTIFICATE hoặc DEATH_REGISTRATION_EXTRACT.
 * - {@code issuingAuthority}: cơ quan cấp (tối đa 255).
 * - {@code documentNumber}: số giấy tờ (tối đa 100).
 * - {@code issuedDate}: ngày cấp, không ở tương lai.
 * - {@code evidenceReference}: tham chiếu chứng cứ (tối đa 500).
 * - {@code notes}: ghi chú (tối đa 1000).
 */
public record RecordDeathDocumentRequest(
        @NotBlank
        @Pattern(
                regexp = "DEATH_CERTIFICATE|DEATH_REGISTRATION_EXTRACT",
                message = "validation.deathDocumentType"
        )
        String documentType,

        @NotBlank
        @Size(max = 255)
        String issuingAuthority,

        @NotBlank
        @Size(max = 100)
        String documentNumber,

        @NotNull
        @PastOrPresent
        LocalDate issuedDate,

        @Size(max = 500)
        String evidenceReference,

        @Size(max = 1000)
        String notes
) {
}
