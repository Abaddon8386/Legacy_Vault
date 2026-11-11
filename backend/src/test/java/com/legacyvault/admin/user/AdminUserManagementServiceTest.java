package com.legacyvault.admin.user;

import com.legacyvault.admin.user.dto.AdminCreateUserRequest;
import com.legacyvault.admin.user.dto.AdminUpdateUserRoleRequest;
import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.service.AdminUserManagementService;
import com.legacyvault.admin.user.service.AdminUserQueryService;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.vault.repository.VaultRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AdminUserManagementServiceTest {
    private static final long ADMIN_ID = 1L;

    private final UserRepository users = mock(UserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
    private final VaultRepository vaults = mock(VaultRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final AuditService audit = mock(AuditService.class);
    private final AdminUserQueryService query = mock(AdminUserQueryService.class);
    private final AdminUserManagementService service =
            new AdminUserManagementService(users, roles, userRoles, vaults, encoder, audit, query);

    @Test
    void createsActiveAccountWithNormalizedEmailHashedPasswordAndRequestedRole() {
        Role staff = role(10L, "ROLE_STAFF_EXECUTOR");
        when(users.existsByEmail("new.staff@example.test")).thenReturn(false);
        when(roles.findByRoleCode("ROLE_STAFF_EXECUTOR")).thenReturn(Optional.of(staff));
        when(encoder.encode("Str0ng-Pass!")).thenReturn("hashed");
        when(users.saveAndFlush(any(User.class))).thenAnswer(call -> {
            User saved = call.getArgument(0);
            ReflectionTestUtils.setField(saved, "userId", 7L);
            ReflectionTestUtils.setField(saved, "publicId", UUID.randomUUID());
            return saved;
        });
        AdminUserResponse expected = new AdminUserResponse(UUID.randomUUID(), "New Staff", "new.staff@example.test",
                List.of("ROLE_STAFF_EXECUTOR"), Instant.now(), "ACTIVE", "ACTIVE", null);
        when(query.getUser(any(), any())).thenReturn(expected);

        AdminUserResponse result = service.createUser(ADMIN_ID, new AdminCreateUserRequest(
                " New Staff ", "  New.Staff@Example.test ", "", "Str0ng-Pass!", "STAFF_EXECUTOR"));

        assertThat(result).isSameAs(expected);
        ArgumentCaptor<User> user = ArgumentCaptor.forClass(User.class);
        verify(users).saveAndFlush(user.capture());
        assertThat(user.getValue().getEmail()).isEqualTo("new.staff@example.test");
        assertThat(user.getValue().getFullName()).isEqualTo("New Staff");
        assertThat(user.getValue().getPasswordHash()).isEqualTo("hashed");
        assertThat(user.getValue().getStatus()).isEqualTo("ACTIVE");
        assertThat(user.getValue().getPhoneNumber()).isNull();
        ArgumentCaptor<UserRole> link = ArgumentCaptor.forClass(UserRole.class);
        verify(userRoles).save(link.capture());
        assertThat(link.getValue().getRole()).isSameAs(staff);
        assertThat(link.getValue().getAssignedByUserId()).isEqualTo(ADMIN_ID);
        verify(audit).record(argThat(event -> event.action() == AuditAction.ADMIN_USER_CREATED
                && event.actorUserId() == ADMIN_ID && event.entityId() == 7L
                && !event.stateAfter().contains("hashed")));
    }

    @Test
    void createRejectsAdminBeneficiaryAndUnknownRolesBeforeTouchingTheDatabase() {
        for (String role : List.of("ADMIN", "ROLE_ADMIN", "BENEFICIARY", "ROOT", "")) {
            assertThatThrownBy(() -> service.createUser(ADMIN_ID,
                    new AdminCreateUserRequest("A", "a@example.test", null, "Str0ng-Pass!", role)))
                    .isInstanceOfSatisfying(BusinessException.class,
                            e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ADMIN_ROLE_NOT_ASSIGNABLE));
        }
        verifyNoInteractions(users);
    }

    @Test
    void createRejectsDuplicateEmail() {
        when(users.existsByEmail("dup@example.test")).thenReturn(true);

        assertThatThrownBy(() -> service.createUser(ADMIN_ID,
                new AdminCreateUserRequest("Dup", "Dup@Example.test", null, "Str0ng-Pass!", "ROLE_LEGAL_VERIFIER")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS));
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void changeRoleReplacesOnlyManagedRolesAndKeepsBeneficiary() {
        UUID publicId = UUID.randomUUID();
        User target = user(5L);
        Role beneficiary = role(1L, "ROLE_BENEFICIARY");
        Role owner = role(2L, "ROLE_VAULT_OWNER");
        Role legal = role(3L, "ROLE_LEGAL_VERIFIER");
        UserRole ownerLink = new UserRole(target, owner);
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(target));
        when(users.findActiveAccountForUpdate(5L)).thenReturn(Optional.of(target));
        when(userRoles.findByUserIdWithRole(5L)).thenReturn(List.of(new UserRole(target, beneficiary), ownerLink));
        when(vaults.existsByOwnerUserId(5L)).thenReturn(false);
        when(roles.findByRoleCode("ROLE_LEGAL_VERIFIER")).thenReturn(Optional.of(legal));

        service.changeRole(ADMIN_ID, publicId, new AdminUpdateUserRoleRequest("LEGAL_VERIFIER"));

        verify(userRoles).deleteAll(List.of(ownerLink));
        ArgumentCaptor<UserRole> added = ArgumentCaptor.forClass(UserRole.class);
        verify(userRoles).saveAndFlush(added.capture());
        assertThat(added.getValue().getRole()).isSameAs(legal);
        verify(audit).record(argThat(event -> event.action() == AuditAction.ADMIN_USER_ROLE_CHANGED
                && event.stateBefore().contains("ROLE_VAULT_OWNER") && event.stateAfter().contains("ROLE_LEGAL_VERIFIER")));
    }

    @Test
    void changeRoleToTheSameRoleIsANoOp() {
        UUID publicId = UUID.randomUUID();
        User target = user(5L);
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(target));
        when(users.findActiveAccountForUpdate(5L)).thenReturn(Optional.of(target));
        when(userRoles.findByUserIdWithRole(5L))
                .thenReturn(List.of(new UserRole(target, role(3L, "ROLE_LEGAL_VERIFIER"))));

        service.changeRole(ADMIN_ID, publicId, new AdminUpdateUserRoleRequest("ROLE_LEGAL_VERIFIER"));

        verify(userRoles, never()).deleteAll(any());
        verify(userRoles, never()).saveAndFlush(any());
        verifyNoInteractions(audit);
    }

    @Test
    void ownerWithAVaultCannotBeMovedAwayFromTheOwnerRole() {
        UUID publicId = UUID.randomUUID();
        User target = user(5L);
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(target));
        when(users.findActiveAccountForUpdate(5L)).thenReturn(Optional.of(target));
        when(userRoles.findByUserIdWithRole(5L))
                .thenReturn(List.of(new UserRole(target, role(2L, "ROLE_VAULT_OWNER"))));
        when(vaults.existsByOwnerUserId(5L)).thenReturn(true);

        assertThatThrownBy(() -> service.changeRole(ADMIN_ID, publicId, new AdminUpdateUserRoleRequest("STAFF_EXECUTOR")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ADMIN_OWNER_HAS_VAULT));
        verify(userRoles, never()).deleteAll(any());
    }

    @Test
    void adminAccountsAndTheCallerThemselvesAreProtected() {
        UUID selfId = UUID.randomUUID();
        when(users.findByPublicId(selfId)).thenReturn(Optional.of(user(ADMIN_ID)));
        assertThatThrownBy(() -> service.changeRole(ADMIN_ID, selfId, new AdminUpdateUserRoleRequest("STAFF_EXECUTOR")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ADMIN_ACCOUNT_PROTECTED));

        UUID otherAdminId = UUID.randomUUID();
        User otherAdmin = user(9L);
        when(users.findByPublicId(otherAdminId)).thenReturn(Optional.of(otherAdmin));
        when(users.findActiveAccountForUpdate(9L)).thenReturn(Optional.of(otherAdmin));
        when(userRoles.findByUserIdWithRole(9L)).thenReturn(List.of(new UserRole(otherAdmin, role(4L, "ROLE_ADMIN"))));
        assertThatThrownBy(() -> service.changeRole(ADMIN_ID, otherAdminId, new AdminUpdateUserRoleRequest("STAFF_EXECUTOR")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ADMIN_ACCOUNT_PROTECTED));
        verify(userRoles, never()).deleteAll(any());
    }

    @Test
    void unknownOrInactiveTargetIsNotFound() {
        UUID missing = UUID.randomUUID();
        when(users.findByPublicId(missing)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.changeRole(ADMIN_ID, missing, new AdminUpdateUserRoleRequest("STAFF_EXECUTOR")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));

        UUID inactive = UUID.randomUUID();
        when(users.findByPublicId(inactive)).thenReturn(Optional.of(user(6L)));
        when(users.findActiveAccountForUpdate(6L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.changeRole(ADMIN_ID, inactive, new AdminUpdateUserRoleRequest("STAFF_EXECUTOR")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Test
    void lockingAnActiveAccountRevokesSessionsAndRecordsTheReason() {
        UUID publicId = UUID.randomUUID();
        User target = user(5L);
        target.setStatus("ACTIVE");
        long versionBefore = target.getAuthVersion();
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(target));
        when(users.findLiveAccountForUpdate(5L)).thenReturn(Optional.of(target));
        when(userRoles.findByUserIdWithRole(5L)).thenReturn(List.of(new UserRole(target, role(3L, "ROLE_LEGAL_VERIFIER"))));

        service.setLocked(ADMIN_ID, publicId, true, "  Suspicious activity  ");

        assertThat(target.getStatus()).isEqualTo("LOCKED");
        assertThat(target.getAuthVersion()).isEqualTo(versionBefore + 1);
        assertThat(target.getPasswordResetAt()).isNull();
        verify(audit).record(argThat(event -> event.action() == AuditAction.ADMIN_USER_LOCKED
                && event.stateBefore().contains("ACTIVE") && event.stateAfter().contains("LOCKED")
                && "Suspicious activity".equals(event.context().get("reason"))));
    }

    @Test
    void accountsInHandoverOrArchivedCannotBeLockedButCanStillBeUnlocked() {
        UUID publicId = UUID.randomUUID();
        User target = user(5L);
        target.setStatus("ACTIVE");
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(target));
        when(users.findLiveAccountForUpdate(5L)).thenReturn(Optional.of(target));
        when(userRoles.findByUserIdWithRole(5L)).thenReturn(List.of(new UserRole(target, role(2L, "ROLE_VAULT_OWNER"))));
        when(vaults.existsByOwnerUserIdAndStatusIn(eq(5L), any())).thenReturn(true);

        assertThatThrownBy(() -> service.setLocked(ADMIN_ID, publicId, true, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ADMIN_ACCOUNT_IN_HANDOVER));
        assertThat(target.getStatus()).isEqualTo("ACTIVE");
        verify(vaults).existsByOwnerUserIdAndStatusIn(5L,
                com.legacyvault.admin.user.service.AdminAccountStatus.LOCK_BLOCKING_VAULT_STATUSES);
        assertThat(com.legacyvault.admin.user.service.AdminAccountStatus.LOCK_BLOCKING_VAULT_STATUSES)
                .contains("ARCHIVED", "HANDOVER_IN_PROGRESS", "UNLOCKED", "AWAITING_VERIFICATION");

        target.setStatus("LOCKED");
        service.setLocked(ADMIN_ID, publicId, false, null);
        assertThat(target.getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void unlockingRestoresActiveWithoutBumpingTheVersionAgain() {
        UUID publicId = UUID.randomUUID();
        User target = user(5L);
        target.setStatus("LOCKED");
        long versionBefore = target.getAuthVersion();
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(target));
        when(users.findLiveAccountForUpdate(5L)).thenReturn(Optional.of(target));
        when(userRoles.findByUserIdWithRole(5L)).thenReturn(List.of(new UserRole(target, role(2L, "ROLE_VAULT_OWNER"))));

        service.setLocked(ADMIN_ID, publicId, false, "ignored");

        assertThat(target.getStatus()).isEqualTo("ACTIVE");
        assertThat(target.getAuthVersion()).isEqualTo(versionBefore);
        verify(audit).record(argThat(event -> event.action() == AuditAction.ADMIN_USER_UNLOCKED
                && !event.context().containsKey("reason")));
    }

    @Test
    void repeatingTheRequestedLockStateIsANoOp() {
        UUID publicId = UUID.randomUUID();
        User target = user(5L);
        target.setStatus("LOCKED");
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(target));
        when(users.findLiveAccountForUpdate(5L)).thenReturn(Optional.of(target));
        when(userRoles.findByUserIdWithRole(5L)).thenReturn(List.of());

        service.setLocked(ADMIN_ID, publicId, true, null);

        verifyNoInteractions(audit);
        assertThat(target.getStatus()).isEqualTo("LOCKED");
    }

    @Test
    void lockRejectsPendingAccountsAdminsAndTheCaller() {
        UUID pendingId = UUID.randomUUID();
        User pending = user(6L);
        pending.setStatus("PENDING");
        when(users.findByPublicId(pendingId)).thenReturn(Optional.of(pending));
        when(users.findLiveAccountForUpdate(6L)).thenReturn(Optional.of(pending));
        when(userRoles.findByUserIdWithRole(6L)).thenReturn(List.of());
        assertThatThrownBy(() -> service.setLocked(ADMIN_ID, pendingId, true, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ADMIN_ACCOUNT_STATE_INVALID));

        UUID adminId = UUID.randomUUID();
        User otherAdmin = user(9L);
        otherAdmin.setStatus("ACTIVE");
        when(users.findByPublicId(adminId)).thenReturn(Optional.of(otherAdmin));
        when(users.findLiveAccountForUpdate(9L)).thenReturn(Optional.of(otherAdmin));
        when(userRoles.findByUserIdWithRole(9L)).thenReturn(List.of(new UserRole(otherAdmin, role(4L, "ROLE_ADMIN"))));
        assertThatThrownBy(() -> service.setLocked(ADMIN_ID, adminId, true, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ADMIN_ACCOUNT_PROTECTED));

        UUID selfId = UUID.randomUUID();
        when(users.findByPublicId(selfId)).thenReturn(Optional.of(user(ADMIN_ID)));
        assertThatThrownBy(() -> service.setLocked(ADMIN_ID, selfId, true, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ADMIN_ACCOUNT_PROTECTED));
        assertThat(pending.getStatus()).isEqualTo("PENDING");
        assertThat(otherAdmin.getStatus()).isEqualTo("ACTIVE");
    }

    private static User user(long id) {
        User user = new User();
        ReflectionTestUtils.setField(user, "userId", id);
        ReflectionTestUtils.setField(user, "publicId", UUID.randomUUID());
        return user;
    }

    private static Role role(long id, String code) {
        Role role = new Role();
        ReflectionTestUtils.setField(role, "roleId", id);
        role.setRoleCode(code);
        return role;
    }
}
