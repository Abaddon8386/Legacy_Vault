package com.legacyvault.verification.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

/**
 * Metadata Staff nhập khi tiếp nhận một phiên bản văn bản căn cứ (ST-18), gửi cùng file số hóa. Hash, phiên bản, người
 * tiếp nhận và thời điểm do server đặt. Mỗi phiên bản phải kèm {@code allocations} (phạm vi phân bổ theo văn bản, kiểm tra ở
 * service). Tiếp nhận không đồng nghĩa đã duyệt.
 *
 * Là phần JSON {@code metadata} của request multipart
 * {@code POST /api/v1/staff/verification-cases/{caseId}/basis-dossier/versions}.
 *
 * Các trường:
 * - {@code legalBasisType}: NOTARIAL_PARTITION, COURT_JUDGMENT hoặc COURT_DECISION.
 * - {@code issuingAuthority}, {@code documentNumber}, {@code issueDate}: cơ quan, số và ngày cấp (không ở tương lai).
 * - {@code notaryAuthority}, {@code notarialDocumentNumber}, {@code notarizedAt}: thông tin công chứng (tùy chọn).
 * - {@code evidenceReference}, {@code notes}: tham chiếu chứng cứ và ghi chú.
 * - {@code allocations}: các dòng phân bổ {@link AllocationInput}, tối đa 200.
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
        String notes,

        @Size(max = 200, message = "{validation.Size}")
        List<@Valid AllocationInput> allocations
) {
}
