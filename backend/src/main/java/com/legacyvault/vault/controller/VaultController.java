package com.legacyvault.vault.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.service.VaultService;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.vault.dto.CreateVaultRequest;
import com.legacyvault.vault.dto.VaultResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.UUID;

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

    /** PS-14: chỉ chủ Vault xem được; Vault của người khác -> 404 (D-API-07). */
    @GetMapping("/{vaultId}")
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public VaultResponse getVault(
            @PathVariable UUID vaultId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return vaultService.getVault(vaultId, principal);
    }

    /** D-API-23: Vault của người đăng nhập, phân trang (D-API-06). */
    @GetMapping
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public PageResponse<VaultResponse> listVaults(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return vaultService.listVaults(principal, page, size);
    }
}