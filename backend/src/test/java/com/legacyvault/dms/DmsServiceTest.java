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
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;

import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.vault.service.VaultService;

class DmsServiceTest {

	@Test
	void refusesToEnableDmsWithoutBeneficiary() {
		Fixture fixture = new Fixture();
		when(fixture.beneficiaries.countByVault_VaultId(15L)).thenReturn(0L);

		BusinessException error = assertThrows(BusinessException.class,
				() -> fixture.service.configure(new DmsDtos.ConfigureRequest(30)));

		assertEquals(ErrorCode.BENEFICIARY_REQUIRED, error.getErrorCode());
		verify(fixture.configs, never()).saveAndFlush(any());
		verify(fixture.audit, never()).record(any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void configuresMonitoringAndRecordsAuditWhenBeneficiaryExists() {
		Fixture fixture = new Fixture();
		when(fixture.beneficiaries.countByVault_VaultId(15L)).thenReturn(1L);
		when(fixture.configs.findByOwnerUserIdForUpdate(5L)).thenReturn(Optional.empty());
		when(fixture.configs.saveAndFlush(any(DmsConfig.class))).thenAnswer(invocation -> invocation.getArgument(0));

		DmsDtos.Response response = fixture.service.configure(new DmsDtos.ConfigureRequest(30));

		assertEquals("MONITORING", response.status());
		assertEquals(30, response.checkIntervalDays());
		assertEquals(fixture.ownerId, response.ownerId());
		assertEquals(1, response.gracePeriodDays());
		verify(fixture.audit).record(eq(5L), eq(15L), eq("DMS_CONFIGURED"), eq("DMS_CONFIG"), any(),
				eq("USER"), any());
	}

	@Test
	void refusesCheckInAfterSchedulerTriggeredDms() {
		Fixture fixture = new Fixture();
		DmsConfig triggered = mock(DmsConfig.class);
		when(triggered.getStatus()).thenReturn("TRIGGERED");
		when(fixture.configs.findByOwnerUserIdForUpdate(5L)).thenReturn(Optional.of(triggered));

		BusinessException error = assertThrows(BusinessException.class, () -> fixture.service.checkIn());

		assertEquals(ErrorCode.DMS_NOT_MONITORING, error.getErrorCode());
		verify(fixture.configs, never()).saveAndFlush(any());
	}

	@Test
	void allowsOwnerCheckInBeforeGraceDeadlineAndRestoresMonitoring() {
		Fixture fixture = new Fixture();
		LocalDateTime now = LocalDateTime.of(2026, 10, 24, 10, 0);
		DmsConfig triggered = triggeredConfig("TRIGGERED", now.plusMinutes(1));
		when(triggered.getStatus()).thenReturn("TRIGGERED", "TRIGGERED", "MONITORING");
		when(fixture.configs.findByOwnerUserIdForUpdate(5L)).thenReturn(Optional.of(triggered));
		when(fixture.configs.saveAndFlush(any(DmsConfig.class))).thenAnswer(invocation -> invocation.getArgument(0));

		DmsDtos.Response response = fixture.service.checkInAt(now);

		assertEquals("MONITORING", response.status());
		verify(triggered).restoreAfterAlert(now);
		verify(fixture.audit).record(eq(5L), eq(15L), eq("DMS_CHECKED_IN"), eq("DMS_CONFIG"), any(),
				eq("USER"), any());
	}

	@Test
	void allowsOwnerCheckInWhileMonitoring() {
		Fixture fixture = new Fixture();
		LocalDateTime now = LocalDateTime.of(2026, 10, 24, 10, 0);
		DmsConfig monitoring = triggeredConfig("MONITORING", now.plusDays(1));
		when(fixture.configs.findByOwnerUserIdForUpdate(5L)).thenReturn(Optional.of(monitoring));
		when(fixture.configs.saveAndFlush(any(DmsConfig.class))).thenAnswer(invocation -> invocation.getArgument(0));

		DmsDtos.Response response = fixture.service.checkInAt(now);

		assertEquals("MONITORING", response.status());
		verify(monitoring).checkIn(now);
		verify(monitoring, never()).restoreAfterAlert(any());
		verify(fixture.audit).record(eq(5L), eq(15L), eq("DMS_CHECKED_IN"), eq("DMS_CONFIG"), any(),
				eq("USER"), any());
	}

	@Test
	void rejectsCheckInWhenGracePeriodExceededStatus() {
		Fixture fixture = new Fixture();
		LocalDateTime now = LocalDateTime.of(2026, 10, 24, 10, 0);
		DmsConfig exceeded = triggeredConfig("GRACE_PERIOD_EXCEEDED", now.plusMinutes(5));
		when(fixture.configs.findByOwnerUserIdForUpdate(5L)).thenReturn(Optional.of(exceeded));

		BusinessException error = assertThrows(BusinessException.class, () -> fixture.service.checkInAt(now));

		assertEquals(ErrorCode.DMS_NOT_MONITORING, error.getErrorCode());
		verify(fixture.configs, never()).saveAndFlush(any());
	}

	@Test
	void rejectsCheckInAtGraceDeadlineAndAfterVaultLeavesActiveState() {
		LocalDateTime now = LocalDateTime.of(2026, 10, 24, 10, 0);
		for (boolean activeVault : List.of(true, false)) {
			Fixture fixture = new Fixture();
			DmsConfig triggered = triggeredConfig("TRIGGERED", now.plusMinutes(activeVault ? 0 : 1));
			when(fixture.vault.getStatus()).thenReturn(activeVault ? Vault.STATUS_ACTIVE : "AWAITING_VERIFICATION");
			when(fixture.configs.findByOwnerUserIdForUpdate(5L)).thenReturn(Optional.of(triggered));

			BusinessException error = assertThrows(BusinessException.class, () -> fixture.service.checkInAt(now));

			assertEquals(ErrorCode.DMS_NOT_MONITORING, error.getErrorCode());
			verify(fixture.configs, never()).saveAndFlush(any());
		}
	}

	private static DmsConfig triggeredConfig(String status, LocalDateTime graceDeadline) {
		DmsConfig config = mock(DmsConfig.class);
		when(config.getStatus()).thenReturn(status);
		when(config.getGraceDeadline()).thenReturn(graceDeadline);
		when(config.getId()).thenReturn(81L);
		when(config.getCheckIntervalDays()).thenReturn(1);
		when(config.getCheckIntervalMinutes()).thenReturn(1440);
		when(config.getGracePeriodDays()).thenReturn(1);
		when(config.getNextCheckAt()).thenReturn(graceDeadline);
		when(config.getLastCheckInAt()).thenReturn(graceDeadline.minusDays(1));
		when(config.getUpdatedAt()).thenReturn(graceDeadline);
		return config;
	}

	private static class Fixture {
		final java.util.UUID ownerId = java.util.UUID.randomUUID();
		final User owner = mock(User.class);
		final Vault vault = mock(Vault.class);
		final DmsConfigRepository configs = mock(DmsConfigRepository.class);
		final BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
		final VaultRepository vaults = mock(VaultRepository.class);
		final VaultService vaultService = mock(VaultService.class);
		final OwnerContextService owners = mock(OwnerContextService.class);
		final AuditService audit = mock(AuditService.class);
		final DmsService service = new DmsService(configs, beneficiaries, vaults, vaultService, owners,
				new DmsPolicy(1, 32767, 1), audit);

		Fixture() {
			when(owner.getUserId()).thenReturn(5L);
			when(owner.getPublicId()).thenReturn(ownerId);
			when(vault.getVaultId()).thenReturn(15L);
			when(owners.requireOwner()).thenReturn(owner);
			when(vaults.findByOwnerUserId(eq(5L), any())).thenReturn(new PageImpl<>(List.of(vault)));
			when(vault.getStatus()).thenReturn("ACTIVE");
		}
	}
}
