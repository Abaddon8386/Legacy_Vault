package com.legacyvault.admin.user;

import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.service.AdminUserQueryService;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminUserQueryServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
    private final VaultRepository vaults = mock(VaultRepository.class);
    private final AdminUserQueryService service = new AdminUserQueryService(users, userRoles, vaults);

    @Test
    void listMapsDistinctPublicFieldsAndSoftDeletedEffectiveStatus() {
        UUID publicId = UUID.randomUUID();
        User user = user(publicId, LocalDateTime.of(2026, 10, 20, 12, 0));
        ReflectionTestUtils.setField(user, "deletedAt", LocalDateTime.of(2026, 10, 21, 0, 0));
        when(users.searchForAdmin("alice", "ROLE_ADMIN", "DELETED", null, PageRequest.of(0, 20,
                org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "createdAt")
                        .and(org.springframework.data.domain.Sort.by("publicId")))))
                .thenReturn(new PageImpl<>(List.of(user), PageRequest.of(0, 20), 1));
        Role adminRole = new Role();
        adminRole.setRoleCode("ROLE_ADMIN");
        Role staffRole = new Role();
        staffRole.setRoleCode("ROLE_STAFF_EXECUTOR");
        when(userRoles.findByUserIdsWithRole(List.of(17L))).thenReturn(List.of(
                new UserRole(user, staffRole), new UserRole(user, adminRole)));

        var result = service.listUsers(" alice ", "role_admin", "deleted", null, 0, 20);

        assertThat(result.content()).containsExactly(new AdminUserResponse(publicId, "Alice Example",
                "alice@example.test", List.of("ROLE_ADMIN", "ROLE_STAFF_EXECUTOR"), LocalDateTime.of(2026, 10, 20, 12, 0)
                .toInstant(ZoneOffset.UTC), "DELETED", "DELETED", null));
        assertThat(result.content().getFirst()).hasNoNullFieldsOrPropertiesExcept("vaultStatus");
    }

    @Test
    void ownerGroupsRemainIndependentFromAccountStatusAndIncludeNoVault() {
        User owner = user(UUID.randomUUID(), LocalDateTime.of(2026, 1, 1, 0, 0));
        owner.setStatus("LOCKED");
        Role role = new Role();
        role.setRoleCode("ROLE_VAULT_OWNER");
        when(users.findByPublicId(owner.getPublicId())).thenReturn(Optional.of(owner));
        when(userRoles.findByUserIdWithRole(17L)).thenReturn(List.of(new UserRole(owner, role)));
        when(vaults.findByOwnerUserIdIn(List.of(17L))).thenReturn(List.of());
        assertThat(service.getUser(owner.getPublicId(), null).vaultStatus()).isEqualTo("NO_VAULT");
        for (String status : List.of("ACTIVE", "ARCHIVED", "AWAITING_VERIFICATION", "DOCUMENT_VERIFICATION",
                "WILL_VERIFICATION", "AWAITING_LEGAL_BASIS", "LEGAL_BASIS_VERIFICATION", "ON_HOLD", "UNLOCKED", "HANDOVER_IN_PROGRESS")) {
            Vault vault = new Vault();
            ReflectionTestUtils.setField(vault, "status", status);
            when(vaults.findByOwnerUserIdIn(List.of(17L))).thenReturn(List.of(vault));
            var result = service.getUser(owner.getPublicId(), null);
            assertThat(result.status()).isEqualTo("LOCKED");
            assertThat(result.vaultStatus()).isEqualTo(List.of("ACTIVE", "ARCHIVED").contains(status) ? status : "IN_PROCESS");
        }
    }

    @Test
    void displayProcessingStateNeverChangesAuthenticationStateOrOverridesBlockedAccounts() {
        User actor = user(UUID.randomUUID(), LocalDateTime.of(2026, 1, 1, 0, 0));
        Role role = new Role();
        role.setRoleCode("ROLE_LEGAL_VERIFIER");
        when(users.findByPublicId(actor.getPublicId())).thenReturn(Optional.of(actor));
        when(userRoles.findByUserIdWithRole(17L)).thenReturn(List.of(new UserRole(actor, role)));
        when(users.findProcessingUserIds(List.of(17L), "ROLE_LEGAL_VERIFIER")).thenReturn(java.util.Set.of(17L));
        var processing = service.getUser(actor.getPublicId(), "ROLE_LEGAL_VERIFIER");
        assertThat(processing.status()).isEqualTo("ACTIVE");
        assertThat(processing.accountStatus()).isEqualTo("IN_PROCESS");
        for (String status : List.of("LOCKED", "PENDING")) {
            actor.setStatus(status);
            assertThat(service.getUser(actor.getPublicId(), "ROLE_LEGAL_VERIFIER").accountStatus()).isEqualTo(status);
        }
        ReflectionTestUtils.setField(actor, "deletedAt", LocalDateTime.of(2026, 11, 11, 0, 0));
        assertThat(service.getUser(actor.getPublicId(), "ROLE_LEGAL_VERIFIER").accountStatus()).isEqualTo("DELETED");
        verify(users, never()).save(any());
    }

    @Test
    void vaultFilterRequiresOwnerRoleAndKnownGroupBeforeQuerying() {
        for (String role : new String[]{null, "ROLE_ADMIN", "ROLE_BENEFICIARY"}) {
            assertThatThrownBy(() -> service.listUsers(null, role, null, "ACTIVE", 0, 20))
                    .isInstanceOf(com.legacyvault.common.error.BusinessException.class);
        }
        assertThatThrownBy(() -> service.listUsers(null, "ROLE_VAULT_OWNER", null, "UNKNOWN", 0, 20))
                .isInstanceOf(com.legacyvault.common.error.BusinessException.class);
        verifyNoInteractions(users, vaults);
    }

    @Test
    void getUserUsesPublicIdAndMissingIdReturnsTypedNotFound() {
        UUID publicId = UUID.randomUUID();
        User user = user(publicId, LocalDateTime.of(2026, 1, 1, 0, 0));
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(user));
        when(userRoles.findByUserIdWithRole(17L)).thenReturn(List.of());
        assertThat(service.getUser(publicId, null).publicId()).isEqualTo(publicId);

        UUID absent = UUID.randomUUID();
        when(users.findByPublicId(absent)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getUser(absent, null))
                .isInstanceOf(com.legacyvault.common.error.BusinessException.class);
    }

    private User user(UUID publicId, LocalDateTime createdAt) {
        User user = new User();
        ReflectionTestUtils.setField(user, "userId", 17L);
        user.setPublicId(publicId);
        user.setFullName("Alice Example");
        user.setEmail("alice@example.test");
        user.setPasswordHash("must-not-be-exposed");
        user.setStatus("ACTIVE");
        ReflectionTestUtils.setField(user, "createdAt", createdAt);
        return user;
    }
}
