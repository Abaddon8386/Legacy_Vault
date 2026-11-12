package com.legacyvault.auth;

import java.text.Normalizer;
import java.util.Locale;

// Class tiện ích chỉ chứa các hàm xử lý email.
// final ngăn class khác kế thừa class tiện ích này.
public final class EmailNormalizer {
    private EmailNormalizer() {}

    // NFKC first (folds full-width and other compatibility forms, turns NBSP into a space), then trim and lowercase.
    // Login lockout keys are derived from this value, so equivalent spellings of one address must collapse to one key.
    public static String normalize(String email) {
        if (email == null) {
            return null;
        }
        return Normalizer.normalize(email, Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT);
    }
}