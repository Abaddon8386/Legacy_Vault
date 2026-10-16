
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
}
