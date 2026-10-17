package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Staff ghi nhận đã nhận bản di chúc giấy gốc tại quầy (ST-13, LV-WILL-001). Chỉ metadata, không có file. Người nhận và
 * thời điểm nhận do server đặt. Ghi nhận việc nộp không xác nhận di chúc hợp lệ.
 */
public record RecordOriginalWillRequest(
        @NotBlank
        @Size(max = 150)
        String deliveredByName,

        @Size(max = 100)
        String deliveredByRelationship,

        @Size(max = 500)
        String evidenceReference,

        @Size(max = 1000)
        String conditionNotes
) {
}
