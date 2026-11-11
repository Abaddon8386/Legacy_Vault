package com.legacyvault.admin.user;

import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.service.AdminUserQueryService;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.admin.user.service.AdminAccountStatus;
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
    private static final PageRequest FIRST_PAGE = PageRequest.of(0, 20,
            org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "createdAt")
                    .and(org.springframework.data.domain.Sort.by("publicId")));

    @Test
    void listMapsDistinctPublicFieldsAndSoftDeletedEffectiveStatus() {
        UUID publicId = UUID.randomUUID();
        User user = user(publicId, LocalDateTime.of(2026, 10, 20, 12, 0));
        ReflectionTestUtils.setField(user, "deletedAt", LocalDateTime.of(2026, 10, 21, 0, 0));
        when(users.searchForAdmin(eq("alice"), eq(false), any(UUID.class), eq("ROLE_ADMIN"), eq("DELETED"),
                eq(AdminAccountStatus.HANDOVER_VAULT_STATUSES), eq(FIRST_PAGE)))
                .thenReturn(new PageImpl<>(List.of(user), PageRequest.of(0, 20), 1));
        Role adminRole = new Role();
        adminRole.setRoleCode("ROLE_ADMIN");
        Role staffRole = new Role();
        staffRole.setRoleCode("ROLE_STAFF_EXECUTOR");
        when(userRoles.findByUserIdsWithRole(List.of(17L))).thenReturn(List.of(
                new UserRole(user, staffRole), new UserRole(user, adminRole)));

        var result = service.listUsers(" alice ", "role_admin", "deleted", 0, 20);

        assertThat(result.content()).containsExactly(new AdminUserResponse(publicId, "Alice Example",
                "alice@example.test", List.of("ROLE_ADMIN", "ROLE_STAFF_EXECUTOR"), LocalDateTime.of(2026, 10, 20, 12, 0)
                .toInstant(ZoneOffset.UTC), "DELETED"));
        assertThat(result.content().getFirst()).hasNoNullFieldsOrProperties();
    }

    @Test
    void accountStatusIsDerivedFromTheVaultAndFollowsItsCurrentState() {
        User archived = user(UUID.randomUUID(), LocalDateTime.of(2026, 10, 20, 12, 0));
        User locked = user(UUID.randomUUID(), LocalDateTime.of(2026, 10, 20, 12, 0));
        ReflectionTestUtils.setField(locked, "userId", 18L);
        locked.setStatus("LOCKED");
        User handover = user(UUID.randomUUID(), LocalDateTime.of(2026, 10, 20, 12, 0));
        ReflectionTestUtils.setField(handover, "userId", 19L);
        User plain = user(UUID.randomUUID(), LocalDateTime.of(2026, 10, 20, 12, 0));
        ReflectionTestUtils.setField(plain, "userId", 20L);
        when(users.searchForAdmin(any(), anyBoolean(), any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(archived, locked, handover, plain), PageRequest.of(0, 20), 4));
        when(userRoles.findByUserIdsWithRole(any())).thenReturn(List.of());
        Vault archivedVault = vault(17L, Vault.STATUS_ARCHIVED);
        Vault lockedOwnerVault = vault(18L, Vault.STATUS_UNLOCKED);
        Vault handoverVault = vault(19L, Vault.STATUS_HANDOVER_IN_PROGRESS);
        when(vaults.findByOwnerUserIdIn(List.of(17L, 18L, 19L, 20L)))
                .thenReturn(List.of(archivedVault, lockedOwnerVault, handoverVault));

        var content = service.listUsers(null, null, null, 0, 20).content();

        // Handover and archive outrank the stored LOCKED status.
        assertThat(content).extracting(AdminUserResponse::status)
                .containsExactly("ARCHIVED", "HANDOVER_IN_PROGRESS", "HANDOVER_IN_PROGRESS", "ACTIVE");

        // The same account follows its vault on the next read: nothing is stored.
        ReflectionTestUtils.setField(handoverVault, "status", Vault.STATUS_ARCHIVED);
        assertThat(service.listUsers(null, null, null, 0, 20).content()).extracting(AdminUserResponse::status)
                .containsExactly("ARCHIVED", "HANDOVER_IN_PROGRESS", "ARCHIVED", "ACTIVE");
    }

    @Test
    void everyVerificationAndHandoverStepCountsAsHandoverButActiveVaultsDoNot() {
        User owner = user(UUID.randomUUID(), LocalDateTime.of(2026, 10, 20, 12, 0));
        for (String vaultStatus : AdminAccountStatus.HANDOVER_VAULT_STATUSES) {
            assertThat(AdminAccountStatus.effective(owner, vaultStatus)).as(vaultStatus).isEqualTo("HANDOVER_IN_PROGRESS");
        }
        assertThat(AdminAccountStatus.HANDOVER_VAULT_STATUSES).containsExactlyInAnyOrder("AWAITING_VERIFICATION",
                "DOCUMENT_VERIFICATION", "WILL_VERIFICATION", "AWAITING_LEGAL_BASIS", "ON_HOLD",
                "LEGAL_BASIS_VERIFICATION", "UNLOCKED", "HANDOVER_IN_PROGRESS");
        assertThat(AdminAccountStatus.effective(owner, Vault.STATUS_ACTIVE)).isEqualTo("ACTIVE");
        assertThat(AdminAccountStatus.effective(owner, null)).isEqualTo("ACTIVE");
        owner.setStatus("PENDING");
        assertThat(AdminAccountStatus.effective(owner, null)).isEqualTo("PENDING");
        ReflectionTestUtils.setField(owner, "deletedAt", LocalDateTime.of(2026, 10, 21, 0, 0));
        assertThat(AdminAccountStatus.effective(owner, Vault.STATUS_ARCHIVED)).as("deleted wins").isEqualTo("DELETED");
    }

    @Test
    void aFullUuidFindsTheAccountByPublicIdWhileOtherTextStaysAPlainNameOrEmailSearch() {
        UUID id = UUID.fromString("3F2B8C1E-AAAA-4BBB-8CCC-123456789ABC");
        when(users.searchForAdmin(any(), anyBoolean(), any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        service.listUsers("  " + id.toString().toLowerCase() + "  ", null, null, 0, 20);
        verify(users).searchForAdmin(eq(id.toString().toLowerCase()), eq(true), eq(id), isNull(), isNull(),
                eq(AdminAccountStatus.HANDOVER_VAULT_STATUSES), eq(FIRST_PAGE));

        for (String text : List.of("3f2b8c1e", "3f2b8c1e-aaaa-4bbb-8ccc", "alice@example.test", "1-1-1-1-1", id + "x")) {
            service.listUsers(text, null, null, 0, 20);
            verify(users).searchForAdmin(eq(text), eq(false), eq(new UUID(0L, 0L)), isNull(), isNull(),
                    eq(AdminAccountStatus.HANDOVER_VAULT_STATUSES), eq(FIRST_PAGE));
        }
    }

    @Test
    void getUserUsesPublicIdAndMissingIdReturnsTypedNotFound() {
        UUID publicId = UUID.randomUUID();
        User user = user(publicId, LocalDateTime.of(2026, 1, 1, 0, 0));
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(user));
        when(userRoles.findByUserIdWithRole(17L)).thenReturn(List.of());
        assertThat(service.getUser(publicId).publicId()).isEqualTo(publicId);

        UUID absent = UUID.randomUUID();
        when(users.findByPublicId(absent)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getUser(absent))
                .isInstanceOf(com.legacyvault.common.error.BusinessException.class);
    }

    private static Vault vault(long ownerId, String status) {
        Vault vault = new Vault();
        ReflectionTestUtils.setField(vault, "ownerUserId", ownerId);
        ReflectionTestUtils.setField(vault, "status", status);
        return vault;
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
