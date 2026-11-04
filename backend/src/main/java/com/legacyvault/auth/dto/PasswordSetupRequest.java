package com.legacyvault.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** First-time password for an account that so far only signs in with Google. */
public record PasswordSetupRequest(
        @NotBlank(message = "{auth.register.password.required}")
        @Size(min = 8, max = 72, message = "{auth.register.password.size}")
        @com.legacyvault.auth.policy.ValidPassword
        String password
) {}
