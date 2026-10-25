package com.legacyvault.dms;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.LegalBasisLockedState;

class DmsGraceMinutesTest {
	private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 12, 12, 0);
	private final DmsPolicy policy = new DmsPolicy(1, 180, 1);

	@Test
	void storesAndReadsDaysHoursMinutes() {
		int minutes = 1 * 1440 + 2 * 60 + 3;
		DmsConfig config = DmsConfig.withGraceMinutes(1L, 60, minutes, NOW.plusHours(1));
		assertEquals(1563, config.getGracePeriodMinutes());
		assertEquals(1, config.getGracePeriodDays());
		var response = DmsDtos.Response.from(java.util.UUID.randomUUID(), config);
		assertEquals(1563, response.gracePeriodMinutes());
		assertEquals(1, response.gracePeriodDays());
	}

	@Test
	void legacyRowWithoutMinutesFallsBackToDays() {
		DmsConfig legacy = new DmsConfig(1L, 7, 3, NOW);
		org.springframework.test.util.ReflectionTestUtils.setField(legacy, "gracePeriodMinutes", null);
		assertEquals(3 * 1440, legacy.getGracePeriodMinutes());
	}

	@Test
	void graceOnlyChangeKeepsCheckInCycle() {
		DmsConfig config = DmsConfig.withGraceMinutes(1L, 60, 10, NOW.plusHours(1));
		config.setGraceMinutes(95);
		assertEquals(95, config.getGracePeriodMinutes());
		assertEquals(NOW.plusHours(1), config.getNextCheckAt());
		assertThrows(IllegalArgumentException.class, () -> config.setGraceMinutes(-1));
		assertThrows(IllegalArgumentException.class, () -> config.setGraceMinutes(DmsConfig.MAX_GRACE_MINUTES + 1));
	}

	@Test
	void policyResolvesGraceAndRejectsInvalid() {
		assertNull(policy.resolveGraceMinutes(new DmsDtos.ConfigureRequest(null, 30)));
		assertEquals(0, policy.resolveGraceMinutes(new DmsDtos.ConfigureRequest(null, 30, null, 0)));
		assertEquals(2880, policy.resolveGraceMinutes(new DmsDtos.ConfigureRequest(null, 30, 2, null)));
		assertEquals(125, policy.resolveGraceMinutes(new DmsDtos.ConfigureRequest(null, 30, null, 125)));
		assertThrows(BusinessException.class, () -> policy.resolveGraceMinutes(new DmsDtos.ConfigureRequest(null, 30, 1, 60)));
		assertThrows(BusinessException.class, () -> policy.resolveGraceMinutes(new DmsDtos.ConfigureRequest(null, 30, null, -1)));
		assertThrows(BusinessException.class, () -> policy.resolveGraceMinutes(new DmsDtos.ConfigureRequest(null, 30, 31, null)));
		assertEquals(1440, policy.gracePeriodMinutes());
	}

	@Test
	void expiryBoundaries() {
		DmsConfig config = DmsConfig.withGraceMinutes(1L, 60, 90, NOW);
		org.springframework.test.util.ReflectionTestUtils.setField(config, "status", DmsConfig.STATUS_TRIGGERED);
		LocalDateTime deadline = NOW.plusMinutes(90);
		org.springframework.test.util.ReflectionTestUtils.setField(config, "graceDeadline", deadline);
		assertFalse(config.isGracePeriodExpired(deadline.minusSeconds(1)));
		assertTrue(config.isGracePeriodExpired(deadline));
		assertTrue(config.isGracePeriodExpired(deadline.plusSeconds(1)));
	}

	@Test
	void triggerComputesDeadlineInMinutes() {
		DmsConfigRepository configs = mock(DmsConfigRepository.class);
		VaultRepository vaults = mock(VaultRepository.class);
		DmsConfig config = DmsConfig.withGraceMinutes(6L, 60, 1563, NOW.minusMinutes(1));
		when(configs.findById(5L)).thenReturn(Optional.of(config));
		when(vaults.findByOwnerUserIdForUpdate(6L)).thenReturn(Optional.empty());
		when(configs.triggerIfExpired(5L, NOW, NOW.plusMinutes(1563))).thenReturn(1);
		var processor = new DmsTriggerProcessor(configs, vaults, mock(VerificationCaseRepository.class),
				mock(AuditService.class), mock(LegalBasisLockedState.class));
		processor.triggerIfExpired(5L, NOW);
		verify(configs).triggerIfExpired(5L, NOW, NOW.plusMinutes(1563));
	}

	@Test
	void graceExpiryIsNotProcessedBeforeDeadline() {
		DmsConfigRepository configs = mock(DmsConfigRepository.class);
		DmsConfig config = DmsConfig.withGraceMinutes(6L, 60, 90, NOW);
		org.springframework.test.util.ReflectionTestUtils.setField(config, "status", DmsConfig.STATUS_TRIGGERED);
		org.springframework.test.util.ReflectionTestUtils.setField(config, "graceDeadline", NOW.plusMinutes(90));
		when(configs.findById(5L)).thenReturn(Optional.of(config));
		VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
		var processor = new DmsTriggerProcessor(configs, mock(VaultRepository.class), cases,
				mock(AuditService.class), mock(LegalBasisLockedState.class));
		processor.processGracePeriodExpired(5L, NOW.plusMinutes(89));
		assertEquals(DmsConfig.STATUS_TRIGGERED, config.getStatus());
		org.mockito.Mockito.verifyNoInteractions(cases);
	}
}
