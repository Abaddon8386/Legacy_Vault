package com.legacyvault.dms;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.vault.Vault;
import com.legacyvault.vault.VaultRepository;

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
		when(config.getGracePeriodDays()).thenReturn(1);
		when(config.getOwnerUserId()).thenReturn(6L);
		when(configs.triggerIfExpired(81L, now, now.plusDays(1))).thenReturn(1);
		when(vaults.findFirstByOwnerUserId(6L)).thenReturn(Optional.of(vault));
		when(vault.getId()).thenReturn(19L);
		DmsTriggerProcessor processor = new DmsTriggerProcessor(configs, vaults, audit);

		processor.triggerIfExpired(81L, now);

		verify(configs).triggerIfExpired(81L, now, now.plusDays(1));
		verify(audit).record(eq(null), eq(19L), eq("DMS_TRIGGERED"), eq("DMS_CONFIG"), eq(81L), eq("SYSTEM"),
				org.mockito.ArgumentMatchers.any());
	}
}
