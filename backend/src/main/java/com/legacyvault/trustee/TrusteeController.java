package com.legacyvault.trustee;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.legacyvault.common.api.PageEnvelope;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * Controller quản lý Trustee của Owner (ST-04): bổ nhiệm, xem, sửa và thu hồi người liên hệ. Base path {@code /api/v1/trustees};
 * yêu cầu authority {@code ROLE_VAULT_OWNER}. Nghiệp vụ ở {@link TrusteeService}.
 */
@Validated
@RestController
@RequestMapping("/api/v1/trustees")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class TrusteeController {

	/**
	 * Service nghiệp vụ Trustee.
	 */
	private final TrusteeService service;

	/**
	 * Khởi tạo controller.
	 *
	 * @param service service Trustee
	 */
	public TrusteeController(TrusteeService service) {
		this.service = service;
	}

	/**
	 * {@code POST /api/v1/trustees} - bổ nhiệm Trustee cho một Vault (role VAULT_OWNER). Body {@link TrusteeDtos.CreateRequest}; trả 201 kèm header
	 * {@code Location} {@code /api/v1/trustees?vaultId=...}. Mỗi Vault chỉ có một Trustee đang APPOINTED.
	 *
	 * @return {@link TrusteeDtos.Response}
	 */
	@PostMapping
	public ResponseEntity<TrusteeDtos.Response> create(@Valid @RequestBody TrusteeDtos.CreateRequest request) {
		TrusteeDtos.Response response = service.create(request);
		URI location = ServletUriComponentsBuilder.fromCurrentContextPath().path("/api/v1/trustees")
				.queryParam("vaultId", response.vaultId()).build().toUri();
		return ResponseEntity.created(location).body(response);
	}

	/**
	 * {@code GET /api/v1/trustees?vaultId=} - Trustee hiện tại của Vault (role VAULT_OWNER), bọc trong {@link PageEnvelope} (0 hoặc 1 phần tử).
	 *
	 * @param vaultId public id của Vault (bắt buộc)
	 */
	@GetMapping
	public PageEnvelope<TrusteeDtos.Response> current(@RequestParam @NotNull UUID vaultId) {
		return service.current(vaultId);
	}

	/**
	 * {@code PUT /api/v1/trustees/{trusteeId}} - cập nhật thông tin Trustee đang APPOINTED (role VAULT_OWNER). Body {@link TrusteeDtos.UpdateRequest}.
	 */
	@PutMapping("/{trusteeId}")
	public TrusteeDtos.Response update(@PathVariable UUID trusteeId,
			@Valid @RequestBody TrusteeDtos.UpdateRequest request) {
		return service.update(trusteeId, request);
	}

	/**
	 * {@code POST /api/v1/trustees/{trusteeId}/revoke} - thu hồi Trustee (role VAULT_OWNER); idempotent nếu đã REVOKED.
	 */
	@PostMapping("/{trusteeId}/revoke")
	public TrusteeDtos.Response revoke(@PathVariable UUID trusteeId) {
		return service.revoke(trusteeId);
	}
}
