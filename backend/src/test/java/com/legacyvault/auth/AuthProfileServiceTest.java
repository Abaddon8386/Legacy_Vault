package com.legacyvault.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.legacyvault.auth.dto.ProfileUpdateRequest;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthProfileServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final JwtService jwt = mock(JwtService.class);
    private final AuditService audit = mock(AuditService.class);
    private final PasswordReauthService reauth = mock(PasswordReauthService.class);
    private final AuthService service = new AuthService(users, roles, userRoles, encoder, jwt, audit, reauth);
    private final Long userId = 8L;
    private final UUID publicId = UUID.randomUUID();
    private final User user = mock(User.class);
    private final UsernamePasswordAuthenticationToken auth = UsernamePasswordAuthenticationToken.authenticated(
            new CustomUserPrincipal(userId, publicId, "before@example.com"), null, List.of());

    @BeforeEach
    void setup() {
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(user));
        when(users.findActiveAccountForUpdate(userId)).thenReturn(Optional.of(user));
        when(user.getUserId()).thenReturn(userId);
        when(user.getPublicId()).thenReturn(publicId);
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.getEmail()).thenReturn("before@example.com");
        when(user.getPhoneNumber()).thenReturn("0900000000");
        when(userRoles.findByUserIdWithRole(userId)).thenReturn(List.of());
    }

    @Test
    void selfReadReturnsOnlyProfileWhitelist() {
        when(user.getFullName()).thenReturn("A User");
        when(user.getEmail()).thenReturn("a@example.com");
        when(user.getPhoneNumber()).thenReturn("0900000000");
        var response = service.getCurrentUser(auth);
        assertThat(response.id()).isEqualTo(publicId);
        assertThat(response.fullName()).isEqualTo("A User");
        assertThat(response.phoneNumber()).isEqualTo("0900000000");
        assertThat(response.roles()).isEmpty();
    }

    @Test
    void updatesOnlyFullNameAndPhoneAndAuditsTheirFieldNames() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setFullName("  New Name ");
        request.setPhoneNumber("");

        service.updateCurrentUser(auth, request);

        verify(users).findActiveAccountForUpdate(userId);
        verify(user).setFullName("New Name");
        verify(user).setPhoneNumber(null);
        verify(user, never()).setEmail(any());
        verify(user, never()).setPasswordHash(any());
        verify(encoder, never()).encode(any());
        verifyNoInteractions(reauth);
        verify(users).flush();

        var event = org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit).record(event.capture());
        assertThat(event.getValue().action()).isEqualTo(AuditAction.AUTH_PROFILE_UPDATED);
        assertThat(event.getValue().actorUserId()).isEqualTo(userId);
        assertThat(event.getValue().context()).containsEntry("changedFields", List.of("fullName", "phoneNumber"));
        assertThat(event.getValue().context().toString()).doesNotContain("New Name", "0900000000");
    }

    @Test
    void omittedAndUnchangedFieldsDoNotCreateAuditOrChangeCredentials() {
        service.updateCurrentUser(auth, new ProfileUpdateRequest());

        verify(users).flush();
        verify(user, never()).setFullName(any());
        verify(user, never()).setPhoneNumber(any());
        verify(user, never()).setEmail(any());
        verify(user, never()).setPasswordHash(any());
        verifyNoInteractions(encoder, audit);
    }

    @Test
    void auditFailurePropagatesInsteadOfReturningSuccessfulProfileUpdate() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setFullName("Updated Name");
        doThrow(new IllegalStateException("audit persistence failed"))
                .when(audit).record(any(AuditEvent.class));

        assertThatThrownBy(() -> service.updateCurrentUser(auth, request))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("audit persistence failed");
    }

    @Test
    void emailChangeRequiresCurrentPasswordNormalizesChecksUniquenessAndAuditsOnlyFieldNames() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setEmail("  NEW@example.test ");
        request.setCurrentPassword("CurrentPass123");
        when(users.existsByEmailAndUserIdNot("new@example.test", userId)).thenReturn(false);

        service.updateCurrentUser(auth, request);

        verify(reauth).requirePassword(userId, null, "CurrentPass123");
        verify(users).existsByEmailAndUserIdNot("new@example.test", userId);
        verify(user).setEmail("new@example.test");
        verify(user).setEmailVerifiedAt(null);
        verify(user, never()).setPasswordHash(any());
        verify(encoder, never()).encode(any());
        var event = org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit).record(event.capture());
        assertThat(event.getValue().context().get("changedFields").toString()).contains("email");
        assertThat(event.getValue().context().toString()).doesNotContain("NEW@example.test", "CurrentPass123");
    }

    @Test
    void duplicateEmailIsRejectedAfterReauthentication() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setEmail("taken@example.test");
        request.setCurrentPassword("CurrentPass123");
        when(users.existsByEmailAndUserIdNot("taken@example.test", userId)).thenReturn(true);

        assertThatThrownBy(() -> service.updateCurrentUser(auth, request))
                .isInstanceOfSatisfying(com.legacyvault.common.error.BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS));

        verify(reauth).requirePassword(userId, null, "CurrentPass123");
        verify(user, never()).setEmail(any());
        verifyNoInteractions(audit);
    }

    @Test
    void concurrentEmailDuplicateIsMappedFromTheNamedUniqueConstraint() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setEmail("raced@example.test");
        request.setCurrentPassword("CurrentPass123");
        when(users.existsByEmailAndUserIdNot("raced@example.test", userId)).thenReturn(false);
        var sql = new java.sql.SQLException("duplicate key");
        var constraint = new org.hibernate.exception.ConstraintViolationException(
                "duplicate key", sql, "UQ_users_email");
        doThrow(new org.springframework.dao.DataIntegrityViolationException("unique email", constraint))
                .when(users).flush();

        assertThatThrownBy(() -> service.updateCurrentUser(auth, request))
                .isInstanceOfSatisfying(com.legacyvault.common.error.BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS));

        verify(reauth).requirePassword(userId, null, "CurrentPass123");
        verifyNoInteractions(audit);
    }

    @Test
    void passwordChangeRequiresReauthenticationHashesPasswordAndAdvancesAuthVersion() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setPassword("NewPassword123");
        request.setCurrentPassword("CurrentPass123");
        when(encoder.encode("NewPassword123")).thenReturn("hashed-new-password");

        service.updateCurrentUser(auth, request);

        verify(reauth).requirePassword(userId, null, "CurrentPass123");
        verify(encoder).encode("NewPassword123");
        verify(user).setPasswordHash("hashed-new-password");
        verify(user).advanceAuthVersion(any());
        verify(users).flush();
        var event = org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit).record(event.capture());
        assertThat(event.getValue().context().toString()).contains("password").doesNotContain("NewPassword123", "hashed-new-password", "CurrentPass123");
    }

    @Test
    void failedReauthenticationDoesNotMutateCredentialsOrWriteProfileAudit() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setEmail("new@example.test");
        request.setPassword("NewPassword123");
        request.setCurrentPassword("WrongPass123");
        doThrow(new com.legacyvault.common.error.BusinessException(ErrorCode.REAUTH_FAILED))
                .when(reauth).requirePassword(userId, null, "WrongPass123");

        assertThatThrownBy(() -> service.updateCurrentUser(auth, request))
                .isInstanceOf(com.legacyvault.common.error.BusinessException.class);

        verify(user, never()).setEmail(any());
        verify(user, never()).setPasswordHash(any());
        verify(user, never()).advanceAuthVersion(any());
        verifyNoInteractions(audit);
    }

    @Test
    void googleOnlyAccountCannotChangePasswordThroughProfile() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setPassword("NewPassword123");
        request.setCurrentPassword("SomePassword123");
        doThrow(new com.legacyvault.common.error.BusinessException(ErrorCode.REAUTH_FAILED))
                .when(reauth).requirePassword(userId, null, "SomePassword123");

        assertThatThrownBy(() -> service.updateCurrentUser(auth, request))
                .isInstanceOfSatisfying(com.legacyvault.common.error.BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.REAUTH_FAILED));

        verify(user, never()).setPasswordHash(any());
        verify(user, never()).advanceAuthVersion(any());
    }

    @Test
    void credentialChangesWithoutCurrentPasswordAreRejectedWithoutCountingAnAttempt() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setEmail("new@example.test");

        assertThatThrownBy(() -> service.updateCurrentUser(auth, request))
                .isInstanceOfSatisfying(com.legacyvault.common.error.BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.MALFORMED_REQUEST));

        verifyNoInteractions(reauth, audit);
        verify(user, never()).setEmail(any());
    }

    @Test
    void invalidNewPasswordIsRejectedBeforeReauthenticationOrMutation() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setPassword("short");
        request.setCurrentPassword("CurrentPass123");

        assertThatThrownBy(() -> service.updateCurrentUser(auth, request))
                .isInstanceOfSatisfying(com.legacyvault.common.error.BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PASSWORD_POLICY));

        verifyNoInteractions(reauth, audit, encoder);
        verify(user, never()).setPasswordHash(any());
    }

    @Test
    void unauthenticatedPrincipalIsRejected() {
        assertThatThrownBy(() -> service.getCurrentUser(null))
                .isInstanceOfSatisfying(com.legacyvault.common.error.BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.UNAUTHENTICATED));
    }
}
