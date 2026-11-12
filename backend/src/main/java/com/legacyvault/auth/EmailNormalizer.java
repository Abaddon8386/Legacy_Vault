package com.legacyvault.auth;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Tiện ích chuẩn hóa email dùng khắp nơi (đăng ký, đăng nhập, đổi email, Google, admin) để cùng một địa chỉ
 * luôn ra cùng một khóa. Lớp {@code final} chỉ chứa hàm tĩnh, không khởi tạo được.
 */
public final class EmailNormalizer {
    private EmailNormalizer() {}

    /**
     * Chuẩn hóa email: NFKC trước (gập ký tự full-width/tương thích, đổi NBSP thành khoảng trắng), sau đó trim và
     * chuyển chữ thường. Khóa khóa-đăng-nhập ({@code LoginAttemptLimiter}) được suy ra từ giá trị này nên các cách viết
     * tương đương của một địa chỉ phải trùng nhau.
     *
     * @param email email gốc, có thể {@code null}
     * @return email đã chuẩn hóa, hoặc {@code null} nếu đầu vào là {@code null}
     */
    public static String normalize(String email) {
        if (email == null) {
            return null;
        }
        return Normalizer.normalize(email, Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT);
    }
}