package com.legacyvault.auth.dto;

/**
 * Phản hồi của {@code POST /api/v1/auth/google/link} (cần đăng nhập) sau khi liên kết danh tính Google thành công.
 * Chỉ xác nhận kết quả, không lộ {@code subject} của nhà cung cấp.
 *
 * @param linked luôn là {@code true} khi liên kết thành công
 */
public record GoogleIdentityLinkResponse(boolean linked) {
}
