package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Staff ghi nhận đã nhận bản di chúc giấy gốc tại quầy (ST-13, LV-WILL-001). Chỉ metadata, không có file. Người nhận và
 * thời điểm nhận do server đặt. Ghi nhận việc nộp không xác nhận di chúc hợp lệ.
 *
 * Body của {@code POST /api/v1/staff/verification-cases/{caseId}/original-will-intakes}.
 *
 * Các trường:
 * - {@code deliveredByName}: người nộp (tối đa 150).
 * - {@code deliveredByRelationship}: quan hệ với chủ vault (tối đa 100).
 * - {@code evidenceReference}: tham chiếu chứng cứ (tối đa 500).
 * - {@code conditionNotes}: mô tả tình trạng bản gốc, bắt buộc (tối đa 1000).
 */
public record RecordOriginalWillRequest(
        @NotBlank
        @Size(max = 150)
        String deliveredByName,

        @Size(max = 100)
        String deliveredByRelationship,

        @Size(max = 500)
        String evidenceReference,

        @NotBlank
        @Size(max = 1000)
        String conditionNotes
) {
}
