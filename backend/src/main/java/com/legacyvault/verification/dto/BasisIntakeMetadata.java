package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Metadata Staff nhập khi tiếp nhận một phiên bản văn bản căn cứ (ST-18), gửi cùng file số hóa. Hash, phiên bản, người
 * tiếp nhận và thời điểm do server đặt. Tiếp nhận không đồng nghĩa đã duyệt.
 */
public record BasisIntakeMetadata(
        @NotBlank(message = "{validation.NotBlank}")
        @Pattern(regexp = "NOTARIAL_PARTITION|COURT_JUDGMENT|COURT_DECISION", message = "validation.legalBasisType")
        String legalBasisType,

        @NotBlank(message = "{validation.NotBlank}")
        @Size(max = 255, message = "{validation.Size}")
        String issuingAuthority,

        @NotBlank(message = "{validation.NotBlank}")
        @Size(max = 100, message = "{validation.Size}")
        String documentNumber,

        @NotNull(message = "{validation.NotNull}")
        @PastOrPresent
        LocalDate issueDate,

        @Size(max = 255, message = "{validation.Size}")
        String notaryAuthority,

        @Size(max = 100, message = "{validation.Size}")
        String notarialDocumentNumber,

        @PastOrPresent
        LocalDate notarizedAt,

        @Size(max = 500, message = "{validation.Size}")
        String evidenceReference,

        @Size(max = 1000, message = "{validation.Size}")
        String notes
) {
}
