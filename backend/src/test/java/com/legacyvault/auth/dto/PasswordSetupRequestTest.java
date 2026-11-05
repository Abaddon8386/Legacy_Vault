package com.legacyvault.auth.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordSetupRequestTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void passwordAndGoogleCredentialAreBothRequired() {
        assertTrue(validator.validate(new PasswordSetupRequest("StrongPass123", "synthetic.jwt.credential")).isEmpty());
        assertFalse(validator.validate(new PasswordSetupRequest("StrongPass123", null)).isEmpty());
        assertFalse(validator.validate(new PasswordSetupRequest("StrongPass123", " ")).isEmpty());
        assertFalse(validator.validate(new PasswordSetupRequest("StrongPass123", "x".repeat(8193))).isEmpty());
        assertFalse(validator.validate(new PasswordSetupRequest(null, "synthetic.jwt.credential")).isEmpty());
        assertFalse(validator.validate(new PasswordSetupRequest("short", "synthetic.jwt.credential")).isEmpty());
    }
}
