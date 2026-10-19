package com.legacyvault.dms;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.LegalBasisLockedState;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.Optional;
import static org.mockito.Mockito.*;

class DmsArchivedVaultTest {
    private final DmsConfigRepository configs=mock(DmsConfigRepository.class);
    private final VaultRepository vaults=mock(VaultRepository.class);
    private final VerificationCaseRepository cases=mock(VerificationCaseRepository.class);
    private final AuditService audit=mock(AuditService.class);
    private final LegalBasisLockedState state=mock(LegalBasisLockedState.class);
    private final DmsTriggerProcessor processor=new DmsTriggerProcessor(configs,vaults,cases,audit,state);
    private final DmsConfig config=mock(DmsConfig.class);
    private final Vault cached=new Vault();
    private final LocalDateTime now=LocalDateTime.of(2026,10,18,10,0);
    DmsArchivedVaultTest(){
        when(configs.findById(3L)).thenReturn(Optional.of(config));when(config.getOwnerUserId()).thenReturn(1L);
        when(vaults.findByOwnerUserIdForUpdate(1L)).thenReturn(Optional.of(cached));
        ReflectionTestUtils.setField(cached,"status","ACTIVE");
        doAnswer(i->{ReflectionTestUtils.setField(cached,"status","ARCHIVED");return null;}).when(state).refresh(cached);
    }
    @Test void schedulerCannotAppendTriggerAuditAfterArchive(){
        when(config.getStatus()).thenReturn("MONITORING");when(config.getNextCheckAt()).thenReturn(now.minusDays(1));
        processor.triggerIfExpired(3L,now);
        verify(state).refresh(cached);
        verify(configs,never()).triggerIfExpired(any(),any(),any());verifyNoInteractions(cases,audit);
    }
    @Test void schedulerCannotInsertVerificationCaseFromCachedActiveVault(){
        when(config.isGracePeriodExpired(now)).thenReturn(true);when(configs.findByIdForUpdate(3L)).thenReturn(Optional.of(config));
        processor.processGracePeriodExpired(3L,now);
        verify(state).refresh(cached);verify(configs,never()).saveAndFlush(any());verifyNoInteractions(cases,audit);
    }
}
