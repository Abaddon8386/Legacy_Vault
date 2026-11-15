
package com.legacyvault.verification.entity;

/**
 * Trạng thái rà soát hồ sơ căn cứ: REVIEW_REQUIRED (cần rà soát), FRESH (snapshot vừa được ghi nhận),
 * STALE (snapshot đã lỗi thời so với dữ liệu hiện tại), INDETERMINATE (chưa xác định được).
 */
public enum LegalBasisReviewStatus {
    REVIEW_REQUIRED,
    FRESH,
    STALE,
    INDETERMINATE
}
