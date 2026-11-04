package com.legacyvault.auth;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditLogRepository;
import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.dto.PasswordSetupRequest;
import com.legacyvault.auth.dto.ProfileUpdateRequest;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.common.security.ReauthFailureRecorder;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** Google-only accounts: first-time Owner creation, first password setup and re-authentication. */
class GoogleOnlyPasswordTest {
    private final UserRepository users = mock(UserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final AuditService audit = mock(AuditService.class);
    private final AuthService service = new AuthService(users, roles, userRoles, encoder, mock(JwtService.class), audit,
            mock(PasswordReauthService.class), mock(com.legacyvault.auth.emailverification.EmailVerificationService.class),
            mock(LoginAttemptLimiter.class));

    @Test
    void createdGoogleOwnerIsActiveVerifiedOwnerWithUnusablePasswordAndAudit() {
        Role owner = new Role();
        owner.setRoleCode("ROLE_VAULT_OWNER");
        when(roles.findByRoleCode("ROLE_VAULT_OWNER")).thenReturn(Optional.of(owner));
        when(encoder.encode(anyString())).thenReturn("random-hash");
        when(users.saveAndFlush(any(User.class))).thenAnswer(call -> withId(call.getArgument(0)));

        User created = service.createGoogleOwner("new@example.test", "  New Person ");

        assertEquals("ACTIVE", created.getStatus());
        assertEquals("new@example.test", created.getEmail());
        assertEquals("New Person", created.getFullName());
        assertNotNull(created.getEmailVerifiedAt());
        assertFalse(created.isPasswordLoginAllowed());
        assertEquals("random-hash", created.getPasswordHash());
        verify(userRoles).save(argThat(link -> link.getRole() == owner));
        verify(audit).record(argThat(event -> event.action() == AuditAction.AUTH_REGISTERED));
    }

    @Test
    void googleOwnerFallsBackToEmailNameWhenGoogleSendsNoName() {
        when(roles.findByRoleCode("ROLE_VAULT_OWNER")).thenReturn(Optional.of(new Role()));
        when(encoder.encode(anyString())).thenReturn("h");
        when(users.saveAndFlush(any(User.class))).thenAnswer(call -> withId(call.getArgument(0)));

        assertEquals("someone", service.createGoogleOwner("someone@example.test", null).getFullName());
        assertEquals(150, service.createGoogleOwner("x@example.test", "n".repeat(300)).getFullName().length());
    }

    private static User withId(User user) {
        org.springframework.test.util.ReflectionTestUtils.setField(user, "userId", 77L);
        return user;
    }

    private User googleOnlyUser() {
        User user = new User();
        user.setPasswordLoginEnabled(false);
        user.setStatus("ACTIVE");
        user.setPasswordHash("random-hash");
        return user;
    }

    @Test
    void setupPasswordEnablesPasswordLoginOnceAndKeepsSessionValid() {
        User user = googleOnlyUser();
        long versionBefore = user.getAuthVersion();
        when(users.findActiveAccountForUpdate(9L)).thenReturn(Optional.of(user));
        when(encoder.encode("StrongPass123")).thenReturn("new-hash");

        assertTrue(service.setupPassword(9L, new PasswordSetupRequest("StrongPass123")).passwordLoginEnabled());

        assertTrue(user.isPasswordLoginAllowed());
        assertEquals("new-hash", user.getPasswordHash());
        assertEquals(versionBefore, user.getAuthVersion());
        verify(audit).record(argThat(event -> event.action() == AuditAction.AUTH_PASSWORD_SET));

        BusinessException second = assertThrows(BusinessException.class,
                () -> service.setupPassword(9L, new PasswordSetupRequest("OtherPass456")));
        assertEquals(ErrorCode.PASSWORD_ALREADY_SET, second.getErrorCode());
        assertEquals("new-hash", user.getPasswordHash());
    }

    @Test
    void setupPasswordIsRefusedForAccountsThatAlreadyHaveOneIncludingLegacyNull() {
        User legacy = new User();
        legacy.setStatus("ACTIVE");
        when(users.findActiveAccountForUpdate(5L)).thenReturn(Optional.of(legacy));

        assertEquals(ErrorCode.PASSWORD_ALREADY_SET, assertThrows(BusinessException.class,
                () -> service.setupPassword(5L, new PasswordSetupRequest("StrongPass123"))).getErrorCode());
        verifyNoInteractions(audit);
    }

    @Test
    void setupPasswordRejectsWeakPasswordWithoutChangingAccount() {
        User user = googleOnlyUser();
        when(users.findActiveAccountForUpdate(9L)).thenReturn(Optional.of(user));

        assertEquals(ErrorCode.PASSWORD_POLICY, assertThrows(BusinessException.class,
                () -> service.setupPassword(9L, new PasswordSetupRequest("short"))).getErrorCode());
        assertFalse(user.isPasswordLoginAllowed());
        verifyNoInteractions(audit);
    }

    @Test
    void setupPasswordRequiresActiveAccount() {
        when(users.findActiveAccountForUpdate(9L)).thenReturn(Optional.empty());
        assertEquals(ErrorCode.UNAUTHENTICATED, assertThrows(BusinessException.class,
                () -> service.setupPassword(9L, new PasswordSetupRequest("StrongPass123"))).getErrorCode());
    }

    @Test
    void reauthReturnsPasswordNotSetWithoutCountingAFailure() {
        UserRepository repo = mock(UserRepository.class);
        AuditLogRepository logs = mock(AuditLogRepository.class);
        ReauthFailureRecorder recorder = mock(ReauthFailureRecorder.class);
        PasswordReauthService reauth = new PasswordReauthService(repo, encoder, logs, recorder, 5, 15);
        when(repo.findById(9L)).thenReturn(Optional.of(googleOnlyUser()));

        assertEquals(ErrorCode.PASSWORD_NOT_SET, assertThrows(BusinessException.class,
                () -> reauth.requirePassword(9L, null, "anything")).getErrorCode());
        verifyNoInteractions(recorder, logs);
    }

    @Test
    void reauthStillRejectsWrongPasswordOfPasswordAccounts() {
        UserRepository repo = mock(UserRepository.class);
        ReauthFailureRecorder recorder = mock(ReauthFailureRecorder.class);
        PasswordReauthService reauth = new PasswordReauthService(repo, encoder, mock(AuditLogRepository.class), recorder, 5, 15);
        User user = new User();
        user.setStatus("ACTIVE");
        user.setPasswordHash("hash");
        when(repo.findById(9L)).thenReturn(Optional.of(user));
        when(encoder.matches("wrong", "hash")).thenReturn(false);

        assertEquals(ErrorCode.REAUTH_FAILED, assertThrows(BusinessException.class,
                () -> reauth.requirePassword(9L, null, "wrong")).getErrorCode());
        verify(recorder).record(9L, null);
    }

    @Test
    void profileUpdateWithSensitiveChangeOnGoogleOnlyAccountAsksForPasswordSetupFirst() {
        User user = googleOnlyUser();
        when(users.findActiveAccountForUpdate(9L)).thenReturn(Optional.of(user));
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setPassword("StrongPass123");
        CustomUserPrincipal principal = new CustomUserPrincipal(9L, UUID.randomUUID(), "g@example.test");
        var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of());

        assertEquals(ErrorCode.PASSWORD_NOT_SET, assertThrows(BusinessException.class,
                () -> service.updateCurrentUser(auth, request)).getErrorCode());
    }
}
