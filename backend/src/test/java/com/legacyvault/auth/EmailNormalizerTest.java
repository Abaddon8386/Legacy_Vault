
package com.legacyvault.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class EmailNormalizerTest {

    // Kiểm tra email được loại bỏ khoảng trắng và chuyển thành chữ thường.
    @Test
    void shouldTrimAndLowercaseEmail() {
        String result =
                EmailNormalizer.normalize(" User@Example.com ");

        assertEquals("user@example.com", result);
    }

    // Kiểm tra email null không gây NullPointerException.
    @Test
    void shouldReturnNullWhenEmailIsNull() {
        String result = EmailNormalizer.normalize(null);

        assertNull(result);
    }

    // Kiểm tra email đã chuẩn hóa vẫn giữ nguyên nội dung.
    @Test
    void shouldKeepNormalizedEmailUnchanged() {
        String result =
                EmailNormalizer.normalize("user@example.com");

        assertEquals("user@example.com", result);
    }

    // Full-width characters are compatibility forms of ASCII; they must map to the same key as the ASCII email.
    @Test
    void shouldFoldFullWidthCharactersToAscii() {
        // "USER@EXAMPLE.COM" written with full-width letters and a full-width at sign.
        String fullWidth = "ＵＳＥＲ＠ＥＸＡＭＰＬＥ.COM";

        assertEquals("user@example.com", EmailNormalizer.normalize(fullWidth));
    }

    // Different casing and Unicode forms of one address must share a single lockout key.
    @Test
    void shouldGiveOneKeyToEveryEquivalentSpelling() {
        String ascii = EmailNormalizer.normalize("user@example.com");

        assertEquals(ascii, EmailNormalizer.normalize("USER@Example.COM"));
        assertEquals(ascii, EmailNormalizer.normalize("  ｕser@example.com "));
        assertEquals(ascii, EmailNormalizer.normalize("user@example.com "));
    }

    // An already composed accent and its decomposed form are the same address.
    @Test
    void shouldComposeCombiningCharacters() {
        assertEquals(EmailNormalizer.normalize("jóse@example.com"),
                EmailNormalizer.normalize("jóse@example.com"));
    }
}
