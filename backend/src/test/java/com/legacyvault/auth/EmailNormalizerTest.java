
package com.legacyvault.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
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
        String fullWidth = "\uff35\uff33\uff25\uff32\uff20\uff25\uff38\uff21\uff2d\uff30\uff2c\uff25.COM";

        assertEquals("user@example.com", EmailNormalizer.normalize(fullWidth));
    }

    // Different casing and Unicode forms of one address must share a single lockout key.
    @Test
    void shouldGiveOneKeyToEveryEquivalentSpelling() {
        String ascii = EmailNormalizer.normalize("user@example.com");

        assertEquals(ascii, EmailNormalizer.normalize("USER@Example.COM"));
        assertEquals(ascii, EmailNormalizer.normalize("  \uff55ser@example.com "));
        assertEquals(ascii, EmailNormalizer.normalize("user@example.com\u00a0"));
    }

    // Precomposed e-acute (U+00E9) and 'e' + combining acute (U+0065 U+0301) are the same address. Written as escapes so
    // an editor cannot silently convert one form into the other.
    @Test
    void shouldComposeCombiningCharacters() {
        String composed = "caf\u00e9@example.com";
        String decomposed = "cafe\u0301@example.com";

        assertNotEquals(composed, decomposed);
        assertEquals("caf\u00e9@example.com", EmailNormalizer.normalize(decomposed));
        assertEquals(EmailNormalizer.normalize(composed), EmailNormalizer.normalize(decomposed));
    }
}
