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

/**
 * Controller REST quản lý ảnh đính kèm Asset (tối đa 5 ảnh JPEG/PNG, mỗi ảnh tối đa 5 MB).
 *
 * Base path: {@code /api/v1/vaults/{vaultId}/assets}. Chỉ role {@code VAULT_OWNER}. Gồm: tạo Asset kèm ảnh
 * ({@code POST /with-images}), liệt kê / thêm / tải / xóa ảnh của một Asset. Nghiệp vụ nằm trong
 * {@link AssetImageService}.
 */
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/assets")
@PreAuthorize("hasRole('VAULT_OWNER')")
public class AssetImageController {
    /**
     * Service nghiệp vụ ảnh Asset.
     */
    private final AssetImageService service;
    /**
     * Khởi tạo controller với {@link AssetImageService}.
     *
     * @param service service nghiệp vụ ảnh Asset
     */
    public AssetImageController(AssetImageService service) { this.service=service; }
    /**
     * Lấy id Owner từ principal đang đăng nhập.
     *
     * @param p principal
     * @return id người dùng
     */
    private Long owner(CustomUserPrincipal p) { return CustomUserPrincipal.requireUserId(p); }
    /**
     * {@code POST /api/v1/vaults/{vaultId}/assets/with-images} (multipart/form-data) - tạo Asset cùng ảnh trong một
     * giao dịch. Part {@code asset} là JSON {@link CreateAssetRequest}, part {@code images} là danh sách file ảnh.
     * Ảnh lỗi thì không để lại Asset dở dang.
     *
     * @return 201 với {@link AssetResponse}
     */
    @PostMapping(value="/with-images", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public AssetResponse create(@PathVariable UUID vaultId, @Valid @RequestPart("asset") CreateAssetRequest asset,
            @RequestPart("images") List<MultipartFile> images, @AuthenticationPrincipal CustomUserPrincipal p) {
        return service.create(vaultId, owner(p), asset, images);
    }
    /**
     * {@code GET /api/v1/vaults/{vaultId}/assets/{assetId}/images} - liệt kê metadata ảnh của Asset (không có nội dung).
     *
     * @return danh sách {@link AssetImageService.ImageInfo} theo thứ tự slot
     */
    @GetMapping("/{assetId}/images")
    public List<AssetImageService.ImageInfo> list(@PathVariable UUID vaultId, @PathVariable UUID assetId,
            @AuthenticationPrincipal CustomUserPrincipal p) { return service.list(vaultId, assetId, owner(p)); }
    /**
     * {@code POST /api/v1/vaults/{vaultId}/assets/{assetId}/images} (multipart/form-data, part {@code images}) - thêm ảnh
     * vào Asset đã có (tổng tối đa 5 ảnh). Trả 201 với danh sách ảnh hiện có.
     */
    @PostMapping(value="/{assetId}/images", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public List<AssetImageService.ImageInfo> add(@PathVariable UUID vaultId, @PathVariable UUID assetId,
            @RequestPart("images") List<MultipartFile> images, @AuthenticationPrincipal CustomUserPrincipal p) {
        return service.add(vaultId, assetId, owner(p), images);
    }
    /**
     * {@code POST /api/v1/vaults/{vaultId}/assets/{assetId}/images/{imageId}/download} - tải ảnh đã giải mã sau khi
     * nhập lại mật khẩu (body {@link RevealAssetRequest}). Response {@code no-store}, {@code nosniff}, dạng attachment
     * {@code application/octet-stream}.
     *
     * @return 200 với byte ảnh
     */
    @PostMapping("/{assetId}/images/{imageId}/download")
    public ResponseEntity<byte[]> open(@PathVariable UUID vaultId, @PathVariable UUID assetId, @PathVariable UUID imageId,
            @Valid @RequestBody RevealAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal p) {
        var bytes = service.open(vaultId, assetId, imageId, owner(p), request.password());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .header("X-Content-Type-Options", "nosniff").header("Content-Disposition", "attachment; filename=asset-image")
            .contentType(MediaType.APPLICATION_OCTET_STREAM).body(bytes);
    }
    /**
     * {@code DELETE /api/v1/vaults/{vaultId}/assets/{assetId}/images/{imageId}} - xóa một ảnh của Asset, trả 204 No Content.
     */
    @DeleteMapping("/{assetId}/images/{imageId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID vaultId, @PathVariable UUID assetId, @PathVariable UUID imageId,
            @AuthenticationPrincipal CustomUserPrincipal p) { service.delete(vaultId, assetId, imageId, owner(p)); }
}
