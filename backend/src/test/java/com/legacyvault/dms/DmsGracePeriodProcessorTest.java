package com.legacyvault.dms;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;

class DmsGracePeriodProcessorTest {

    private DmsConfigRepository configs;
    private VaultRepository vaults;
    private VerificationCaseRepository verificationCases;
    private AuditService audit;
    private DmsTriggerProcessor processor;

    @BeforeEach
    void setUp() {
        configs = mock(DmsConfigRepository.class);
        vaults = mock(VaultRepository.class);
        verificationCases = mock(VerificationCaseRepository.class);
        audit = mock(AuditService.class);

        processor = new DmsTriggerProcessor(
                configs, vaults, verificationCases, audit
        );
    }

    @Test
    void doesNothingWhenGracePeriodHasNotExpired() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 15, 12, 0);
        DmsConfig config = mock(DmsConfig.class);

        when(configs.findById(1L)).thenReturn(Optional.of(config));
        when(config.isGracePeriodExpired(now)).thenReturn(false);

        processor.processGracePeriodExpired(1L, now);

        verify(vaults, never()).findByOwnerUserIdForUpdate(any());
        verify(verificationCases, never()).saveAndFlush(any());
        verifyNoInteractions(audit);
    }

    @Test
    void doesNothingWhenDmsDoesNotExist() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 15, 12, 0);

        when(configs.findById(1L)).thenReturn(Optional.empty());

        processor.processGracePeriodExpired(1L, now);

        verifyNoInteractions(verificationCases, audit);
    }

    @Test
    void doesNotCreateCaseWhenVaultIsMissing() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 15, 12, 0);
        DmsConfig config = mock(DmsConfig.class);

        when(configs.findById(1L)).thenReturn(Optional.of(config));
        when(config.isGracePeriodExpired(now)).thenReturn(true);
        when(config.getOwnerUserId()).thenReturn(10L);
        when(vaults.findByOwnerUserIdForUpdate(10L))
                .thenReturn(Optional.empty());

        processor.processGracePeriodExpired(1L, now);

        verify(verificationCases, never()).saveAndFlush(any());
        verifyNoInteractions(audit);
    }

    @Test
    void doesNotCreateDuplicateOpenCase() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 15, 12, 0);
        DmsConfig config = mock(DmsConfig.class);
        Vault vault = mock(Vault.class);

        when(configs.findById(1L)).thenReturn(Optional.of(config));
        when(config.isGracePeriodExpired(now)).thenReturn(true);
        when(config.getOwnerUserId()).thenReturn(10L);

        when(vaults.findByOwnerUserIdForUpdate(10L))
                .thenReturn(Optional.of(vault));

        when(configs.findByIdForUpdate(1L))
                .thenReturn(Optional.of(config));

        when(vault.canEnterVerification()).thenReturn(true);
        when(vault.getVaultId()).thenReturn(20L);

        when(verificationCases.existsByVaultIdAndStatus(
                20L, VerificationCase.STATUS_OPEN
        )).thenReturn(true);

        processor.processGracePeriodExpired(1L, now);

        verify(verificationCases, never()).saveAndFlush(any());
        verify(vaults, never()).saveAndFlush(any());
        verifyNoInteractions(audit);
    }

    @Test
    void doesNotCreateCaseWhenVaultIsNotActive() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 15, 12, 0);
        DmsConfig config = mock(DmsConfig.class);
        Vault vault = mock(Vault.class);

        when(configs.findById(1L)).thenReturn(Optional.of(config));
        when(config.isGracePeriodExpired(now)).thenReturn(true);
        when(config.getOwnerUserId()).thenReturn(10L);

        when(vaults.findByOwnerUserIdForUpdate(10L))
                .thenReturn(Optional.of(vault));

        when(configs.findByIdForUpdate(1L))
                .thenReturn(Optional.of(config));

        when(vault.canEnterVerification()).thenReturn(false);

        processor.processGracePeriodExpired(1L, now);

        verify(verificationCases, never()).saveAndFlush(any());
        verify(vaults, never()).saveAndFlush(any());
    }
}