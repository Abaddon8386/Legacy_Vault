package com.legacyvault.beneficiary;

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
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * Controller quản lý người thụ hưởng của chủ kho. Đường dẫn gốc {@code /api/v1/vaults/{vaultId}/beneficiaries}; yêu cầu vai trò
 * {@code ROLE_VAULT_OWNER}. Ủy quyền toàn bộ cho {@code BeneficiaryService}. Phía frontend được gọi từ màn quản lý người thụ hưởng của Owner.
 */
@Validated
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/beneficiaries")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class BeneficiaryController {

	private final BeneficiaryService service;

	/**
	 * Hàm khởi tạo, nhận {@code BeneficiaryService}.
	 */
	public BeneficiaryController(BeneficiaryService service) {
		this.service = service;
	}

	/**
	 * {@code POST /api/v1/vaults/{vaultId}/beneficiaries} (vai trò VAULT_OWNER): thêm người thụ hưởng mới.
	 * @param vaultId mã công khai của Vault
	 * @param request {@code BeneficiaryDtos.UpsertRequest} đã validate
	 * @return HTTP 201 kèm header Location tới {@code /{beneficiaryId}} và body {@code BeneficiaryDtos.Response}
	 */
	@PostMapping
	public ResponseEntity<BeneficiaryDtos.Response> create(@PathVariable UUID vaultId,
			@Valid @RequestBody BeneficiaryDtos.UpsertRequest request) {
		BeneficiaryDtos.Response response = service.create(vaultId, request);
		URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{beneficiaryId}")
				.buildAndExpand(response.id()).toUri();
		return ResponseEntity.created(location).body(response);
	}

	/**
	 * {@code GET /api/v1/vaults/{vaultId}/beneficiaries?page=&size=} (vai trò VAULT_OWNER): liệt kê người thụ hưởng, sắp xếp mới nhất trước.
	 * @param page số trang từ 0 (mặc định 0)
	 * @param size kích thước trang 1-100 (mặc định 20)
	 * @return {@code PageEnvelope} của {@code BeneficiaryDtos.Response}
	 */
	@GetMapping
	public PageEnvelope<BeneficiaryDtos.Response> list(@PathVariable UUID vaultId,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
		return service.list(vaultId, page, size);
	}

	/**
	 * {@code PUT /api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}} (vai trò VAULT_OWNER): cập nhật hồ sơ người thụ hưởng.
	 * @return {@code BeneficiaryDtos.Response} sau cập nhật
	 */
	@PutMapping("/{beneficiaryId}")
	public BeneficiaryDtos.Response update(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId,
			@Valid @RequestBody BeneficiaryDtos.UpsertRequest request) {
		return service.update(vaultId, beneficiaryId, request);
	}
}
