package com.legacyvault.auth.dto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class RegisterRequestTest {

    @Test
    void shouldStoreAllRegistrationFields() {
        RegisterRequest request = new RegisterRequest(
                "Nguyen Van A",
                "user@example.com",
                "Password123",
                "+84901234567"
        );

        assertEquals("Nguyen Van A", request.fullName());
        assertEquals("user@example.com", request.email());
        assertEquals("Password123", request.password());
        assertEquals("+84901234567", request.phone());
    }

    @Test
    void shouldAllowNullPhone() {
        RegisterRequest request = new RegisterRequest(
                "Nguyen Van A",
                "user@example.com",
                "Password123",
                null
        );

        assertNull(request.phone());
    }
}