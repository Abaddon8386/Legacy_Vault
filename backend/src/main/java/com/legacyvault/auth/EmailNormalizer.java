package com.legacyvault.auth;

import java.util.Locale;

// Class tiện ích chỉ chứa các hàm xử lý email.
// final ngăn class khác kế thừa class tiện ích này.
public final class EmailNormalizer {
    private EmailNormalizer() {}

    public static String normalize(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}