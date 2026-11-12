
package com.legacyvault.verification.entity;

/**
 * Trạng thái rà soát hồ sơ căn cứ của Legal (lưu dạng tên trong {@code legal_basis_dossiers.review_status}).
 * <ul>
 * <li>{@code REVIEW_REQUIRED}: cần rà soát (mặc định, hoặc có thay đổi cần xem lại).</li>
 * <li>{@code FRESH}: đã rà soát và ảnh chụp còn khớp dữ liệu hiện tại.</li>
 * <li>{@code STALE}: ảnh chụp rà soát đã lỗi thời do dữ liệu thay đổi.</li>
 * <li>{@code INDETERMINATE}: không xác định được tính cập nhật.</li>
 * </ul>
 */
public enum LegalBasisReviewStatus {
    REVIEW_REQUIRED,
    FRESH,
    STALE,
    INDETERMINATE
}
