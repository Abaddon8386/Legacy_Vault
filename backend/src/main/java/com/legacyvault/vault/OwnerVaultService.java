package com.legacyvault.vault;

import java.util.UUID;

import org.springframework.stereotype.Service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;

@Service
public class OwnerVaultService {

	private final OwnerContextService ownerContext;
	private final VaultRepository vaults;

	public OwnerVaultService(OwnerContextService ownerContext, VaultRepository vaults) {
		this.ownerContext = ownerContext;
		this.vaults = vaults;
	}

	public Vault requireOwnedVault(UUID vaultPublicId, User owner) {
		return vaults.findByPublicIdAndOwnerUserId(vaultPublicId, owner.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
	}

	public void requireEditable(Vault vault) {
		if (!"ACTIVE".equals(vault.getStatus())) {
			throw new BusinessException(ErrorCode.VAULT_NOT_EDITABLE);
		}
	}
}
