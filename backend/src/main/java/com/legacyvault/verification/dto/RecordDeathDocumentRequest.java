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
