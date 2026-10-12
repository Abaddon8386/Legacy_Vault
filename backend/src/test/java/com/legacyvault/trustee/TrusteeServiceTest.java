package com.legacyvault.trustee;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.UserAccount;
import com.legacyvault.vault.OwnerVaultService;
import com.legacyvault.vault.Vault;

class TrusteeServiceTest {

	@Test
	void vaultWithoutTrusteeIsValidAndReturnsEmptyContent() {
		TrusteeRepository trusteeRepository = mock(TrusteeRepository.class);
		OwnerVaultService ownerVaults = mock(OwnerVaultService.class);
		OwnerContextService owners = mock(OwnerContextService.class);
		UserAccount owner = mock(UserAccount.class);
		Vault vault = mock(Vault.class);
		when(owners.requireOwner()).thenReturn(owner);

		// Use a stable key for the service call and lookup.
		java.util.UUID vaultId = java.util.UUID.randomUUID();
		when(ownerVaults.requireOwnedVault(vaultId, owner)).thenReturn(vault);
		when(vault.getId()).thenReturn(42L);
		when(trusteeRepository.findFirstByVault_IdAndStatus(42L, "APPOINTED")).thenReturn(Optional.empty());

		TrusteeService service = new TrusteeService(trusteeRepository, ownerVaults, owners, mock(AuditService.class));

		assertTrue(service.current(vaultId).content().isEmpty());
	}
}
