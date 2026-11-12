package com.legacyvault.asset.controller;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.CacheControl;
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
import com.legacyvault.asset.dto.AssetSecretResponse;
import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.dto.RevealAssetRequest;
import com.legacyvault.asset.dto.UpdateAssetRequest;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * Controller REST quản lý Asset (tài sản số dạng TEXT / CREDENTIAL) nằm trong một Vault (assets.md).
 *
 * Base path: {@code /api/v1/vaults/{vaultId}/assets}. Yêu cầu role {@code VAULT_OWNER} (thiếu role -> 403);
 * Vault không phải của Owner đang đăng nhập -> 404 (kiểm tra trong {@link AssetService} qua {@code VaultService}).
 * Controller chỉ nhận request, validate DTO ({@code @Valid}), lấy id Owner từ {@link CustomUserPrincipal} rồi ủy quyền
 * toàn bộ nghiệp vụ cho {@link AssetService}.
 *
 * <p>Các endpoint: POST tạo, GET danh sách (phân trang), GET chi tiết, POST {@code /reveal} xem nội dung bảo mật,
 * PATCH cập nhật một phần.
 */
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/assets")
@PreAuthorize("hasRole('VAULT_OWNER')")
public class AssetController {

	/**
	 * Service xử lý nghiệp vụ Asset (tạo, liệt kê, xem, cập nhật, reveal).
	 */
	private final AssetService assetService;

	/**
	 * Khởi tạo controller với {@link AssetService} do Spring inject.
	 *
	 * @param assetService service nghiệp vụ Asset
	 */
	public AssetController(AssetService assetService) {
		this.assetService = assetService;
	}

	/**
	 * {@code POST /api/v1/vaults/{vaultId}/assets} - tạo Asset mới trong Vault (role VAULT_OWNER).
	 *
	 * Body: {@link CreateAssetRequest} (name, assetType TEXT hoặc CREDENTIAL, description, payload). Gọi
	 * {@link AssetService#createAsset}, trả 201 Created kèm header {@code Location} trỏ tới Asset mới.
	 *
	 * @param vaultId public id của Vault chứa Asset
	 * @param request body đã được validate
	 * @param principal Owner đang đăng nhập
	 * @return 201 với {@link AssetResponse} (không chứa payload)
	 */
	@PostMapping
	public ResponseEntity<AssetResponse> createAsset(@PathVariable UUID vaultId,
			@Valid @RequestBody CreateAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
		AssetResponse created = assetService.createAsset(vaultId, CustomUserPrincipal.requireUserId(principal), request);
		URI location = URI.create("/api/v1/vaults/" + vaultId + "/assets/" + created.id());
		return ResponseEntity.created(location).body(created);
	}

	/**
	 * {@code GET /api/v1/vaults/{vaultId}/assets?page=&size=} - liệt kê Asset của Vault, mới nhất trước (role VAULT_OWNER).
	 *
	 * @param vaultId public id của Vault
	 * @param page số trang bắt đầu từ 0 (mặc định 0)
	 * @param size kích thước trang 1..100 (mặc định 20)
	 * @param principal Owner đang đăng nhập
	 * @return {@link PageResponse} các {@link AssetResponse} (không gồm Asset loại DOCUMENT)
	 */
	@GetMapping
	public PageResponse<AssetResponse> listAssets(@PathVariable UUID vaultId,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return assetService.listAssets(vaultId, CustomUserPrincipal.requireUserId(principal), page, size);
	}

	/**
	 * {@code GET /api/v1/vaults/{vaultId}/assets/{assetId}} - xem metadata một Asset (role VAULT_OWNER).
	 * Không trả payload; muốn xem nội dung phải dùng {@link #revealAsset}.
	 *
	 * @return {@link AssetResponse}; 404 nếu Vault/Asset không thuộc Owner
	 */
	@GetMapping("/{assetId}")
	public AssetResponse getAsset(@PathVariable UUID vaultId, @PathVariable UUID assetId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return assetService.getAsset(vaultId, assetId, CustomUserPrincipal.requireUserId(principal));
	}

	/**
	 * {@code POST /api/v1/vaults/{vaultId}/assets/{assetId}/reveal} - xem nội dung bảo mật sau khi nhập lại mật khẩu
	 * (D-API-32, role VAULT_OWNER). Dùng POST vì mật khẩu nằm trong body, và response được đặt
	 * {@code Cache-Control: no-store} để không bị lưu cache.
	 *
	 * Body: {@link RevealAssetRequest}. Gọi {@link AssetService#revealAsset}; sai mật khẩu -> 403, bị khóa thử -> 429.
	 *
	 * @return 200 với {@link AssetSecretResponse} chứa payload đã giải mã
	 */
	@PostMapping("/{assetId}/reveal")
	public ResponseEntity<AssetSecretResponse> revealAsset(@PathVariable UUID vaultId, @PathVariable UUID assetId,
			@Valid @RequestBody RevealAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
		AssetSecretResponse secret = assetService.revealAsset(vaultId, assetId,
				CustomUserPrincipal.requireUserId(principal), request.password());
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(secret);
	}

	/**
	 * {@code PATCH /api/v1/vaults/{vaultId}/assets/{assetId}} - cập nhật một phần Asset (name, description, payload;
	 * role VAULT_OWNER). Body {@link UpdateAssetRequest} bắt buộc kèm mật khẩu hiện tại (PS-111). Gọi
	 * {@link AssetService#updateAsset}.
	 *
	 * @return {@link AssetResponse} sau cập nhật
	 */
	@PatchMapping("/{assetId}")
	public AssetResponse updateAsset(@PathVariable UUID vaultId, @PathVariable UUID assetId,
			@Valid @RequestBody UpdateAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return assetService.updateAsset(vaultId, assetId, CustomUserPrincipal.requireUserId(principal), request);
	}
}
