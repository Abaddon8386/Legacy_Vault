package com.legacyvault.asset.controller;

import com.legacyvault.asset.dto.*;
import com.legacyvault.asset.service.AssetImageService;
import com.legacyvault.common.security.CustomUserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;

@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/assets")
@PreAuthorize("hasRole('VAULT_OWNER')")
public class AssetImageController {
    private final AssetImageService service;
    public AssetImageController(AssetImageService service) { this.service=service; }
    private Long owner(CustomUserPrincipal p) { return CustomUserPrincipal.requireUserId(p); }
    @PostMapping(value="/with-images", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public AssetResponse create(@PathVariable UUID vaultId, @Valid @RequestPart("asset") CreateAssetRequest asset,
            @RequestPart("images") List<MultipartFile> images, @AuthenticationPrincipal CustomUserPrincipal p) {
        return service.create(vaultId, owner(p), asset, images);
    }
    @GetMapping("/{assetId}/images")
    public List<AssetImageService.ImageInfo> list(@PathVariable UUID vaultId, @PathVariable UUID assetId,
            @AuthenticationPrincipal CustomUserPrincipal p) { return service.list(vaultId, assetId, owner(p)); }
    @PostMapping(value="/{assetId}/images", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public List<AssetImageService.ImageInfo> add(@PathVariable UUID vaultId, @PathVariable UUID assetId,
            @RequestPart("images") List<MultipartFile> images, @AuthenticationPrincipal CustomUserPrincipal p) {
        return service.add(vaultId, assetId, owner(p), images);
    }
    @PostMapping("/{assetId}/images/{imageId}/download")
    public ResponseEntity<byte[]> open(@PathVariable UUID vaultId, @PathVariable UUID assetId, @PathVariable UUID imageId,
            @Valid @RequestBody RevealAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal p) {
        var bytes = service.open(vaultId, assetId, imageId, owner(p), request.password());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .header("X-Content-Type-Options", "nosniff").header("Content-Disposition", "attachment; filename=asset-image")
            .contentType(MediaType.APPLICATION_OCTET_STREAM).body(bytes);
    }
    @DeleteMapping("/{assetId}/images/{imageId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID vaultId, @PathVariable UUID assetId, @PathVariable UUID imageId,
            @AuthenticationPrincipal CustomUserPrincipal p) { service.delete(vaultId, assetId, imageId, owner(p)); }
}
