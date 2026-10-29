package com.legacyvault.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;

import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.springframework.security.crypto.password.PasswordEncoder;

class PersonalAccountLoginTest {
    final UserRepository users = mock(UserRepository.class);
    final RoleRepository roles = mock(RoleRepository.class);
    final UserRoleRepository userRoles = mock(UserRoleRepository.class);
    final PasswordEncoder passwords = mock(PasswordEncoder.class);
    final JwtService jwt = mock(JwtService.class);
    final AuthService service = new AuthService(users, roles, userRoles, passwords, jwt,
            mock(AuditService.class), mock(PasswordReauthService.class));
    final User user = mock(User.class);

    PersonalAccountLoginTest() {
        when(user.getUserId()).thenReturn(55L);
        when(user.getPublicId()).thenReturn(UUID.randomUUID());
        when(user.getEmail()).thenReturn("personal@example.test");
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.isPasswordLoginAllowed()).thenReturn(true);
        when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwords.matches("Valid-pass1", null)).thenReturn(true);
        when(users.findActiveAccountForUpdate(55L)).thenReturn(Optional.of(user));
        when(jwt.generateAccessToken(any(), any(), anyList(), eq(0))).thenReturn("test-token");
        when(jwt.getExpirationSeconds()).thenReturn(3600L);
        Role owner = mock(Role.class);
        when(owner.getRoleId()).thenReturn(1L);
        when(owner.getRoleCode()).thenReturn("ROLE_VAULT_OWNER");
        when(roles.findByRoleCode("ROLE_VAULT_OWNER")).thenReturn(Optional.of(owner));
    }

    List<UserRole> assignments(List<String> codes) {
        return codes.stream().map(code -> {
            Role role = mock(Role.class); when(role.getRoleCode()).thenReturn(code);
            UserRole ur = mock(UserRole.class); when(ur.getRole()).thenReturn(role); return ur;
        }).toList();
    }

    static Stream<List<String>> personal() {
        return Stream.of(List.of(), List.of("ROLE_BENEFICIARY"));
    }

    @ParameterizedTest @MethodSource("personal")
    void successfulLoginRepairsOnlyPersonalAccountAndPreservesBeneficiary(List<String> codes) {
        var assigned = assignments(codes);
        when(userRoles.findByUser_UserId(55L)).thenReturn(assigned);
        when(userRoles.findByUserIdWithRole(55L)).thenReturn(assigned);
        var result = service.login(new LoginRequest(user.getEmail(), "Valid-pass1"));
        assertThat(result.user().roles()).contains("VAULT_OWNER");
        if (codes.isEmpty()) assertThat(result.user().roles()).doesNotContain("BENEFICIARY");
        else assertThat(result.user().roles()).contains("BENEFICIARY");
        ArgumentCaptor<UserRole> saved = ArgumentCaptor.forClass(UserRole.class);
        verify(userRoles).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getRole().getRoleCode()).isEqualTo("ROLE_VAULT_OWNER");
        assertThat(saved.getValue().getUser()).isSameAs(user);
    }

    static Stream<List<String>> unchanged() {
        return Stream.of(List.of("ROLE_VAULT_OWNER"), List.of("ROLE_BENEFICIARY", "ROLE_VAULT_OWNER"),
                List.of("ROLE_ADMIN"), List.of("ROLE_STAFF_EXECUTOR"), List.of("ROLE_LEGAL_VERIFIER"),
                List.of("ROLE_BENEFICIARY", "ROLE_ADMIN"), List.of("ROLE_BENEFICIARY", "ROLE_STAFF_EXECUTOR"),
                List.of("ROLE_BENEFICIARY", "ROLE_LEGAL_VERIFIER"), List.of("ROLE_UNKNOWN"));
    }

    @ParameterizedTest @MethodSource("unchanged")
    void ownerInternalMixedAndUnknownRolesNeverReceiveAnotherAssignment(List<String> codes) {
        var assigned = assignments(codes);
        when(userRoles.findByUser_UserId(55L)).thenReturn(assigned);
        service.login(new LoginRequest(user.getEmail(), "Valid-pass1"));
        verify(userRoles, never()).saveAndFlush(any());
        verify(users, never()).findActiveAccountForUpdate(any());
    }

    @Test void concurrentLoginsRecheckRolesUnderAccountLockAndDoNotDuplicate() {
        when(userRoles.findByUser_UserId(55L)).thenReturn(List.of());
        var current = assignments(List.of("ROLE_VAULT_OWNER"));
        when(userRoles.findByUserIdWithRole(55L)).thenReturn(current);
        assertThat(service.login(new LoginRequest(user.getEmail(), "Valid-pass1")).user().roles())
                .containsExactly("VAULT_OWNER");
        verify(userRoles, never()).saveAndFlush(any());
    }

    @Test void roleChangedToInternalWhileWaitingForLockIsNotUpgraded() {
        when(userRoles.findByUser_UserId(55L)).thenReturn(List.of());
        var current = assignments(List.of("ROLE_STAFF_EXECUTOR"));
        when(userRoles.findByUserIdWithRole(55L)).thenReturn(current);
        assertThat(service.login(new LoginRequest(user.getEmail(), "Valid-pass1")).user().roles())
                .containsExactly("STAFF_EXECUTOR");
        verify(userRoles, never()).saveAndFlush(any());
    }

    @Test void failedCredentialsCannotGrantAnyRole() {
        when(passwords.matches("Invalid", null)).thenReturn(false);
        assertThrows(BusinessException.class, () -> service.login(new LoginRequest(user.getEmail(), "Invalid")));
        verifyNoInteractions(userRoles);
    }

    @Test void lockedAccountCannotBeRepaired() {
        when(users.findActiveAccountForUpdate(55L)).thenReturn(Optional.empty());
        assertThrows(BusinessException.class, () -> service.login(new LoginRequest(user.getEmail(), "Valid-pass1")));
        verify(userRoles, never()).saveAndFlush(any());
    }
}
