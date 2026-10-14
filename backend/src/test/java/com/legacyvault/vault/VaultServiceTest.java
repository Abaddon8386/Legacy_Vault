
package com.legacyvault.vault;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.dto.CreateVaultRequest;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.vault.service.VaultService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VaultServiceTest {

    @Mock
    private VaultRepository vaultRepository;

    @InjectMocks
    private VaultService vaultService;

    private CustomUserPrincipal principal;

    @BeforeEach
    void setUp() {
        principal = new CustomUserPrincipal(
                10L,
                UUID.randomUUID(),
                "owner@example.com"
        );
    }

    @Test
    void createVault_shouldSaveVaultForAuthenticatedOwner() {
        CreateVaultRequest request =
                new CreateVaultRequest("My Vault", "Test description");

        when(vaultRepository.existsByOwnerUserId(10L)).thenReturn(false);
        when(vaultRepository.saveAndFlush(any(Vault.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assertDoesNotThrow(() -> vaultService.createVault(request, principal));

        ArgumentCaptor<Vault> captor = ArgumentCaptor.forClass(Vault.class);
        verify(vaultRepository).saveAndFlush(captor.capture());

        Vault savedVault = captor.getValue();
        assertEquals(10L, savedVault.getOwnerUserId());
        assertEquals("My Vault", savedVault.getName());
        verify(vaultRepository).existsByOwnerUserId(10L);
    }

    @Test
    void createVault_shouldRejectDuplicateOwner() {
        CreateVaultRequest request =
                new CreateVaultRequest("Another Vault", "Duplicate test");

        when(vaultRepository.existsByOwnerUserId(10L)).thenReturn(true);

        assertThrows(
                BusinessException.class,
                () -> vaultService.createVault(request, principal)
        );

        verify(vaultRepository, never()).saveAndFlush(any(Vault.class));
    }

    @Test
    void createVault_shouldUseOwnerFromPrincipal() {
        CreateVaultRequest request =
                new CreateVaultRequest("Owner Test", "Ownership test");

        when(vaultRepository.existsByOwnerUserId(10L)).thenReturn(false);
        when(vaultRepository.saveAndFlush(any(Vault.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        vaultService.createVault(request, principal);

        ArgumentCaptor<Vault> captor = ArgumentCaptor.forClass(Vault.class);
        verify(vaultRepository).saveAndFlush(captor.capture());

        assertEquals(10L, captor.getValue().getOwnerUserId());
    }
}
