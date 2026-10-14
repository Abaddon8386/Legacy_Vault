package com.legacyvault.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "{auth.login.email.required}")
        @Email(message = "{auth.login.email.invalid}")
        @Size(max = 254, message = "{auth.login.email.max}")
        String email,

        @NotBlank(message = "{auth.login.password.required}")
        @Size(max = 72, message = "{auth.login.password.max}")
        String password
) {
}