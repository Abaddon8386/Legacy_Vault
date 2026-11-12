package com.legacyvault.beneficiary;

import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Controller kiểm tra cấu hình Vault. Đường dẫn gốc {@code /api/v1/vaults/{vaultId}/configuration-check}; yêu cầu {@code ROLE_VAULT_OWNER}.
 */
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/configuration-check")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class VaultConfigurationController {

	private final BeneficiaryService service;

	/**
	 * Hàm khởi tạo, nhận {@code BeneficiaryService}.
	 */
	public VaultConfigurationController(BeneficiaryService service) {
		this.service = service;
	}

	/**
	 * {@code GET /api/v1/vaults/{vaultId}/configuration-check}: cho biết Vault đã đủ cấu hình chưa (hiện yêu cầu có ít nhất một người thụ hưởng).
	 * @return {@code BeneficiaryDtos.ConfigurationCheck}
	 */
	@GetMapping
	public BeneficiaryDtos.ConfigurationCheck check(@PathVariable UUID vaultId) {
		return service.configurationCheck(vaultId);
	}
}
