package com.legacyvault.asset.controller;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.asset.dto.AssetResponse;
import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.dto.UpdateAssetRequest;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Asset của Vault (assets.md). Thiếu role VAULT_OWNER -> 403; Vault không phải của mình -> 404. */
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/assets")
@PreAuthorize("hasRole('VAULT_OWNER')")
public class AssetController {

	private final AssetService assetService;

	public AssetController(AssetService assetService) {
		this.assetService = assetService;
	}

	@PostMapping
	public ResponseEntity<AssetResponse> createAsset(@PathVariable UUID vaultId,
			@Valid @RequestBody CreateAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
		AssetResponse created = assetService.createAsset(vaultId, CustomUserPrincipal.requireUserId(principal), request);
		URI location = URI.create("/api/v1/vaults/" + vaultId + "/assets/" + created.id());
		return ResponseEntity.created(location).body(created);
	}

	@GetMapping
	public PageResponse<AssetResponse> listAssets(@PathVariable UUID vaultId,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return assetService.listAssets(vaultId, CustomUserPrincipal.requireUserId(principal), page, size);
	}

	@GetMapping("/{assetId}")
	public AssetResponse getAsset(@PathVariable UUID vaultId, @PathVariable UUID assetId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return assetService.getAsset(vaultId, assetId, CustomUserPrincipal.requireUserId(principal));
	}

	@PatchMapping("/{assetId}")
	public AssetResponse updateAsset(@PathVariable UUID vaultId, @PathVariable UUID assetId,
			@Valid @RequestBody UpdateAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return assetService.updateAsset(vaultId, assetId, CustomUserPrincipal.requireUserId(principal), request);
	}
}
