package com.legacyvault.beneficiary;

import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/configuration-check")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class VaultConfigurationController {

	private final BeneficiaryService service;

	public VaultConfigurationController(BeneficiaryService service) {
		this.service = service;
	}

	@GetMapping
	public BeneficiaryDtos.ConfigurationCheck check(@PathVariable UUID vaultId) {
		return service.configurationCheck(vaultId);
	}
}
