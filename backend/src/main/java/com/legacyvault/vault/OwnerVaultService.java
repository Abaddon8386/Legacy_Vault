package com.legacyvault.vault;

import java.util.UUID;

import org.springframework.stereotype.Service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.UserAccount;

@Service
public class OwnerVaultService {

	private final OwnerContextService ownerContext;
	private final VaultRepository vaults;

	public OwnerVaultService(OwnerContextService ownerContext, VaultRepository vaults) {
		this.ownerContext = ownerContext;
		this.vaults = vaults;
	}

	public Vault requireOwnedVault(UUID vaultPublicId, UserAccount owner) {
		return vaults.findByPublicIdAndOwnerUserId(vaultPublicId, owner.getId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
	}

	public void requireEditable(Vault vault) {
		if (!vault.isEditable()) {
			throw new BusinessException(ErrorCode.VAULT_NOT_EDITABLE);
		}
	}
}
