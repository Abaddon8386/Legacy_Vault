package com.legacyvault.auth.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoogleLoginRequestTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void credentialIsRequiredAndLengthBounded() {
        assertFalse(validator.validate(new GoogleLoginRequest(" ")).isEmpty());
        assertFalse(validator.validate(new GoogleLoginRequest("x".repeat(8193))).isEmpty());
        assertTrue(validator.validate(new GoogleLoginRequest("synthetic.jwt.credential")).isEmpty());
    }
}
