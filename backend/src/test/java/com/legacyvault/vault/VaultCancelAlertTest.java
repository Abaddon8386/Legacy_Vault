package com.legacyvault.vault;

import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.dms.DmsConfig;
import com.legacyvault.dms.DmsConfigRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.vault.service.VaultService;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VaultCancelAlertTest {

    @Mock
    VaultRepository vaultRepository;

    @Mock
    AuditService auditService;

    @Mock
    DmsConfigRepository dmsConfigRepository;

    @Mock
    VerificationCaseRepository verificationCaseRepository;

    VaultService vaultService;

    @BeforeEach
    void setUp() {
        vaultService = new VaultService(
                vaultRepository,
                auditService,
                dmsConfigRepository,
                verificationCaseRepository
        );
    }

    @Test
    void cancelAlertShouldReturnNotFoundWhenVaultIsNotOwned() {
        UUID publicId = UUID.randomUUID();
        Long ownerId = 10L;

        CustomUserPrincipal principal = mock(CustomUserPrincipal.class);
        when(principal.userId()).thenReturn(ownerId);

        when(vaultRepository.findOwnedVaultForUpdate(publicId, ownerId))
                .thenReturn(Optional.empty());

        assertThrows(
                BusinessException.class,
                () -> vaultService.cancelAlert(publicId, principal)
        );

        verifyNoInteractions(dmsConfigRepository);
        verifyNoInteractions(auditService);
    }
}
