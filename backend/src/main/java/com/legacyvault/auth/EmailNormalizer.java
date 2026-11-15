package com.legacyvault.auth;

import java.text.Normalizer;
import java.util.Locale;

// Class tiện ích chỉ chứa các hàm xử lý email.
// final ngăn class khác kế thừa class tiện ích này.
public final class EmailNormalizer {
    private EmailNormalizer() {}

    // Trước hết NFKC (gộp dạng full-width và các dạng tương thích khác, đổi NBSP thành dấu cách), sau đó trim và chuyển chữ thường.
    // Khóa giới hạn đăng nhập được suy ra từ giá trị này, nên các cách viết tương đương của một địa chỉ phải gộp về cùng một khóa.
    /**
     * Chuẩn hóa email về một dạng duy nhất: NFKC, bỏ khoảng trắng hai đầu, chữ thường (Locale.ROOT).
     * Dùng cho đăng ký, đăng nhập, khóa giới hạn đăng nhập và so sánh trùng email.
     * @param email email gốc, có thể null
     * @return email đã chuẩn hóa, hoặc null nếu đầu vào null
     */
    public static String normalize(String email) {
        if (email == null) {
            return null;
        }
        return Normalizer.normalize(email, Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT);
    }
}