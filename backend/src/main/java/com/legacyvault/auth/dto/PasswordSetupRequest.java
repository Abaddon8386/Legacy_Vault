package com.legacyvault.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * First-time password for an account that so far only signs in with Google. A fresh Google ID token is required so
 * that a bare session cannot set the password: the token's subject must be linked to the signed-in account.
 */
public record PasswordSetupRequest(
        @NotBlank(message = "{auth.register.password.required}")
        @Size(min = 8, max = 72, message = "{auth.register.password.size}")
        @com.legacyvault.auth.policy.ValidPassword
        String password,

        @NotBlank(message = "{auth.google.credential.required}")
        @Size(max = 8192, message = "{auth.google.credential.max}")
        String credential
) {}
