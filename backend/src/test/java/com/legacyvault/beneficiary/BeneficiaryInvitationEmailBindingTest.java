package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.vault.service.VaultService;

import jakarta.persistence.EntityManager;

class BeneficiaryInvitationEmailBindingTest {
    private static final Long USER_ID = 17L;
    private static final Long VAULT_ID = 29L;
    private static final String CODE = "AbCdEfGhIjKlMnOpQrStVw";
    private final BeneficiaryInvitationRepository invitations = mock(BeneficiaryInvitationRepository.class);
    private final BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
    private final OwnerContextService owners = mock(OwnerContextService.class);
    private final VaultService ownerVaults = mock(VaultService.class);
    private final VaultRepository vaults = mock(VaultRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final EntityManager entities = mock(EntityManager.class);
    private final AuditService audit = mock(AuditService.class);
    private final InvitationTokens tokens = new InvitationTokens();
    private final Beneficiary beneficiary = mock(Beneficiary.class);
    private final Vault vault = mock(Vault.class);
    private final User account = mock(User.class);
    private final UUID beneficiaryPublicId = UUID.randomUUID();
    private final BeneficiaryInvitationService service = new BeneficiaryInvitationService(invitations, beneficiaries,
            owners, ownerVaults, vaults, users, userRoles, roles, tokens, entities, audit);

    @BeforeEach
    void setUp() {
        when(beneficiary.getVault()).thenReturn(vault);
        when(beneficiary.getId()).thenReturn(31L);
        when(beneficiary.getPublicId()).thenReturn(beneficiaryPublicId);
        when(beneficiary.getIdentityVerificationStatus()).thenReturn(Beneficiary.VERIFIED_AT_COUNTER);
        when(beneficiary.getAccountStatus()).thenReturn("ACCOUNT_CREATED");
        when(vault.getVaultId()).thenReturn(VAULT_ID);
        when(vault.getOwnerUserId()).thenReturn(3L);
        when(vault.getStatus()).thenReturn("ACTIVE");
        when(account.getStatus()).thenReturn("ACTIVE");
        when(account.getEmail()).thenReturn("recipient@example.test");
        when(account.getEmailVerifiedAt()).thenReturn(LocalDateTime.of(2026, 10, 20, 10, 0));
        when(users.findActiveAccountForUpdate(USER_ID)).thenReturn(Optional.of(account));
        when(vaults.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault));
        UserRole beneficiaryRole = mock(UserRole.class);
        Role role = mock(Role.class);
        when(role.getRoleCode()).thenReturn("ROLE_BENEFICIARY");
        when(beneficiaryRole.getRole()).thenReturn(role);
        when(userRoles.findByUserIdWithRole(USER_ID)).thenReturn(List.of(beneficiaryRole));
        when(beneficiaries.existsByVault_VaultIdAndLinkedUserId(VAULT_ID, USER_ID)).thenReturn(false);
    }

    @Test
    void rejectsLegacyUnboundInvitation() {
        var invitation = invitation(null);
        when(invitations.findByCodeHash(tokens.hash(CODE))).thenReturn(Optional.of(invitation));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.redeemBoundAccount(CODE, USER_ID));

        assertEquals(ErrorCode.BENEFICIARY_INVITATION_INVALID, error.getErrorCode());
        verify(userRoles, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void legacyUnboundInvitationStillRequiresVerifiedAccountEmail() {
        when(account.getEmailVerifiedAt()).thenReturn(null);
        var invitation = invitation(null);
        when(invitations.findByCodeHash(tokens.hash(CODE))).thenReturn(Optional.of(invitation));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.redeemBoundAccount(CODE, USER_ID));

        assertEquals(ErrorCode.BENEFICIARY_INVITATION_EMAIL_VERIFICATION_REQUIRED, error.getErrorCode());
        verify(userRoles, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rejectsInvitationBoundToAnotherEmail() {
        when(account.getEmailVerifiedAt()).thenReturn(null);
        var invitation = invitation("other@example.test");
        when(invitations.findByCodeHash(tokens.hash(CODE))).thenReturn(Optional.of(invitation));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.redeemBoundAccount(CODE, USER_ID));

        assertEquals(ErrorCode.BENEFICIARY_INVITATION_INVALID, error.getErrorCode());
        verify(userRoles, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void linksStaffBoundInvitationWhenEmailMatchesEvenIfAccountEmailIsNotMarkedVerified() {
        when(account.getEmailVerifiedAt()).thenReturn(null);
        var invitation = invitation(" RECIPIENT@example.test ");
        when(invitations.findByCodeHash(tokens.hash(CODE))).thenReturn(Optional.of(invitation));

        var result = service.redeemBoundAccount(CODE, USER_ID);

        assertEquals(beneficiaryPublicId, result.beneficiaryId());
        verify(beneficiary).linkAccount(USER_ID);
        assertEquals(USER_ID, invitation.getConsumedBy());
        org.junit.jupiter.api.Assertions.assertNotNull(invitation.getConsumedAt());
    }

    @Test
    void emailBindingDoesNotReplaceLegacyCounterVerification() {
        var invitation = invitation("recipient@example.test");
        when(invitations.findByCodeHash(tokens.hash(CODE))).thenReturn(Optional.of(invitation));
        when(beneficiary.getIdentityVerificationStatus()).thenReturn(Beneficiary.NOT_VERIFIED);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.redeemBoundAccount(CODE, USER_ID));

        assertEquals(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED, error.getErrorCode());
        verify(userRoles, never()).save(org.mockito.ArgumentMatchers.any());
    }

    private BeneficiaryInvitation invitation(String email) {
        return new BeneficiaryInvitation(beneficiary, 1, tokens.hash(CODE), 4L,
                LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1), email);
    }
}
