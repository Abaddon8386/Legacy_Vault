package com.legacyvault.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** GIS ID-token credential sent by the existing PS-83 client. */
public record GoogleLoginRequest(
        @NotBlank(message = "{auth.google.credential.required}")
        @Size(max = 8192, message = "{auth.google.credential.max}")
        String credential
) {
}
