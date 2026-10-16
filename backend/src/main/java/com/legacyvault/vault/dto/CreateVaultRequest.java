package com.legacyvault.vault.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateVaultRequest(
        @NotBlank(message = "{vault.name.notBlank}")
        @Size(max = 150, message = "{vault.name.max}")
        String name,

        @Size(max = 1000, message = "{vault.description.max}")
        String description
) {
}