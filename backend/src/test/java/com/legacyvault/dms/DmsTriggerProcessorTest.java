package com.legacyvault.dms;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;

class DmsTriggerProcessorTest {

	@Test
	void triggersOnlyEligibleMonitoringConfigAndAuditsSystemAction() {
		DmsConfigRepository configs = mock(DmsConfigRepository.class);
		VaultRepository vaults = mock(VaultRepository.class);
		AuditService audit = mock(AuditService.class);
		DmsConfig config = mock(DmsConfig.class);
		Vault vault = mock(Vault.class);
		LocalDateTime now = LocalDateTime.of(2026, 10, 12, 12, 0);
		when(configs.findById(81L)).thenReturn(Optional.of(config));
		when(config.getStatus()).thenReturn("MONITORING");
		when(config.getNextCheckAt()).thenReturn(now.minusDays(1));
		when(config.getGracePeriodMinutes()).thenReturn(1440);
		when(config.getOwnerUserId()).thenReturn(6L);
		when(configs.triggerIfExpired(81L, now, now.plusMinutes(1440))).thenReturn(1);
		when(vaults.findByOwnerUserIdForUpdate(6L)).thenReturn(Optional.of(vault));
		when(vault.getVaultId()).thenReturn(19L);
		VerificationCaseRepository verificationCases =
				mock(VerificationCaseRepository.class);

		DmsTriggerProcessor processor =
				new DmsTriggerProcessor(configs, vaults, verificationCases, audit,
				        mock(com.legacyvault.verification.service.LegalBasisLockedState.class));

		processor.triggerIfExpired(81L, now);

		verify(configs).triggerIfExpired(81L, now, now.plusMinutes(1440));
		verify(audit).record(eq(null), eq(19L), eq("DMS_TRIGGERED"), eq("DMS_CONFIG"), eq(81L), eq("SYSTEM"),
				org.mockito.ArgumentMatchers.any());
	}
}
