package com.legacyvault.dms;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.UserAccount;
import com.legacyvault.vault.OwnerVaultService;
import com.legacyvault.vault.Vault;

class DmsServiceTest {

	@Test
	void refusesToEnableDmsWithoutBeneficiary() {
		Fixture fixture = new Fixture();
		when(fixture.beneficiaries.countByVault_Id(15L)).thenReturn(0L);

		BusinessException error = assertThrows(BusinessException.class,
				() -> fixture.service.configure(fixture.vaultId, new DmsDtos.ConfigureRequest(30)));

		assertEquals(ErrorCode.BENEFICIARY_REQUIRED, error.getErrorCode());
		verify(fixture.configs, never()).saveAndFlush(any());
		verify(fixture.audit, never()).record(any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void configuresMonitoringAndRecordsAuditWhenBeneficiaryExists() {
		Fixture fixture = new Fixture();
		when(fixture.beneficiaries.countByVault_Id(15L)).thenReturn(1L);
		when(fixture.configs.findByOwnerUserId(5L)).thenReturn(Optional.empty());
		when(fixture.configs.saveAndFlush(any(DmsConfig.class))).thenAnswer(invocation -> invocation.getArgument(0));

		DmsDtos.Response response = fixture.service.configure(fixture.vaultId, new DmsDtos.ConfigureRequest(30));

		assertEquals("MONITORING", response.status());
		assertEquals(30, response.checkIntervalDays());
		assertEquals(fixture.vaultId, response.vaultId());
		verify(fixture.audit).record(eq(5L), eq(15L), eq("DMS_CONFIGURED"), eq("DMS_CONFIG"), any(),
				eq("USER"), any());
	}

	@Test
	void refusesCheckInAfterSchedulerTriggeredDms() {
		Fixture fixture = new Fixture();
		DmsConfig triggered = mock(DmsConfig.class);
		when(triggered.getStatus()).thenReturn("TRIGGERED");
		when(fixture.configs.findByOwnerUserId(5L)).thenReturn(Optional.of(triggered));

		BusinessException error = assertThrows(BusinessException.class, () -> fixture.service.checkIn(fixture.vaultId));

		assertEquals(ErrorCode.DMS_NOT_MONITORING, error.getErrorCode());
		verify(fixture.configs, never()).saveAndFlush(any());
	}

	private static class Fixture {
		final UUID vaultId = UUID.randomUUID();
		final UserAccount owner = mock(UserAccount.class);
		final Vault vault = mock(Vault.class);
		final DmsConfigRepository configs = mock(DmsConfigRepository.class);
		final BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
		final OwnerVaultService ownerVaults = mock(OwnerVaultService.class);
		final OwnerContextService owners = mock(OwnerContextService.class);
		final AuditService audit = mock(AuditService.class);
		final DmsService service = new DmsService(configs, beneficiaries, ownerVaults, owners,
				new DmsPolicy(1, 32767), audit);

		Fixture() {
			when(owner.getId()).thenReturn(5L);
			when(vault.getId()).thenReturn(15L);
			when(vault.getPublicId()).thenReturn(vaultId);
			when(owners.requireOwner()).thenReturn(owner);
			when(ownerVaults.requireOwnedVault(vaultId, owner)).thenReturn(vault);
		}
	}
}
