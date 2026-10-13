package com.legacyvault.vault;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.dto.CreateVaultRequest;
import com.legacyvault.vault.dto.VaultResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/vaults")
public class VaultController {

    private final VaultService vaultService;

    public VaultController(VaultService vaultService) {
        this.vaultService = vaultService;
    }

    @PostMapping
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public ResponseEntity<VaultResponse> createVault(
            @Valid @RequestBody CreateVaultRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        VaultResponse response = vaultService.createVault(request, principal);

        URI location = ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(response.id())
                .toUri();

        return ResponseEntity.created(location).body(response);
    }
}