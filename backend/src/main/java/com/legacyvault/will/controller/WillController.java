package com.legacyvault.will.controller;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.will.dto.WillResponse;
import com.legacyvault.will.dto.WillVersionResponse;
import com.legacyvault.will.service.WillService;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * Di chúc số hóa (wills.md). Chỉ metadata — không có API tải/xem nội dung file trong Sprint 1 (D-API-14).
 * Thiếu role VAULT_OWNER -> 403; Vault/di chúc không phải của mình -> 404.
 */
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/wills")
@PreAuthorize("hasRole('VAULT_OWNER')")
public class WillController {

	private final WillService willService;

	public WillController(WillService willService) {
		this.willService = willService;
	}

	/** Phần {@code file} không bắt buộc ở tầng binding để thiếu file trả 400 VALIDATION_FAILED như contract. */
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<WillResponse> uploadWill(@PathVariable UUID vaultId,
			@RequestPart(name = "file", required = false) MultipartFile file,
			@RequestParam(name = "note", required = false) @Size(max = 500) String note,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		WillResponse created = willService.uploadWill(vaultId, CustomUserPrincipal.requireUserId(principal), file, note);
		return ResponseEntity.created(willLocation(vaultId, created.id())).body(created);
	}

	@PostMapping(path = "/{willId}/versions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<WillResponse> addVersion(@PathVariable UUID vaultId, @PathVariable UUID willId,
			@RequestPart(name = "file", required = false) MultipartFile file,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		WillResponse updated = willService.addVersion(vaultId, willId, CustomUserPrincipal.requireUserId(principal), file);
		return ResponseEntity.created(willLocation(vaultId, willId)).body(updated);
	}

	@GetMapping
	public PageResponse<WillResponse> listWills(@PathVariable UUID vaultId,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return willService.listWills(vaultId, CustomUserPrincipal.requireUserId(principal), page, size);
	}

	@GetMapping("/{willId}")
	public WillResponse getWill(@PathVariable UUID vaultId, @PathVariable UUID willId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return willService.getWill(vaultId, willId, CustomUserPrincipal.requireUserId(principal));
	}

	@GetMapping("/{willId}/versions")
	public List<WillVersionResponse> listVersions(@PathVariable UUID vaultId, @PathVariable UUID willId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return willService.listVersions(vaultId, willId, CustomUserPrincipal.requireUserId(principal));
	}

	private static URI willLocation(UUID vaultId, UUID willId) {
		return URI.create("/api/v1/vaults/" + vaultId + "/wills/" + willId);
	}
}
