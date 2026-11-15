package com.legacyvault.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Credential là GIS ID token do client PS-83 hiện có gửi lên. */
public record GoogleLoginRequest(
        @NotBlank(message = "{auth.google.credential.required}")
        @Size(max = 8192, message = "{auth.google.credential.max}")
        String credential
) {
}
