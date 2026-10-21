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
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class AuthProfileServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final JwtService jwt = mock(JwtService.class);
    private final AuditService audit = mock(AuditService.class);
    private final AuthService service = new AuthService(users, roles, userRoles, encoder, jwt, audit);
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
    void updatesWhitelistedFieldsAndHashesPassword() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setFullName("  New Name ");
        request.setEmail("NEW@example.com");
        request.setPhoneNumber("");
        request.setPassword("NewPass123");
        when(users.existsByEmailAndUserIdNot("new@example.com", userId)).thenReturn(false);
        when(encoder.encode("NewPass123")).thenReturn("bcrypt-hash");

        service.updateCurrentUser(auth, request);

        verify(users).findActiveAccountForUpdate(userId);
        verify(user).setFullName("New Name");
        verify(user).setEmail("new@example.com");
        verify(user).setEmailVerifiedAt(null);
        verify(user).setPhoneNumber(null);
        verify(user).setPasswordHash("bcrypt-hash");
        verify(encoder, never()).encode("bcrypt-hash");
        verify(users).flush();

        var events = org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit, times(3)).record(events.capture());
        assertThat(events.getAllValues()).extracting(AuditEvent::action).containsExactly(
                AuditAction.AUTH_PROFILE_UPDATED,
                AuditAction.AUTH_EMAIL_CHANGED,
                AuditAction.AUTH_PASSWORD_CHANGED);
        for (AuditEvent event : events.getAllValues()) {
            assertThat(event.actorType()).isEqualTo(AuditActorType.USER);
            assertThat(event.actorUserId()).isEqualTo(userId);
            assertThat(event.entityType()).isEqualTo("USER");
            assertThat(event.entityId()).isEqualTo(userId);
            assertThat(event.ruleId()).isEqualTo("LV-AUD-001");
            assertThat(event.context()).containsEntry("result", "SUCCESS");
            assertThat(event.context().toString()).doesNotContain(
                    "NEW@example.com", "new@example.com", "NewPass123", "bcrypt-hash");
        }
        assertThat(events.getAllValues().get(0).context())
                .containsEntry("changedFields", List.of("fullName", "phoneNumber"));
        assertThat(events.getAllValues().get(1).context())
                .containsEntry("changedFields", List.of("email"));
        assertThat(events.getAllValues().get(2).context())
                .containsEntry("changedFields", List.of("password"));
    }

    @Test
    void omittedPasswordDoesNotChangeHash() {
        service.updateCurrentUser(auth, new ProfileUpdateRequest());
        verify(user, never()).setPasswordHash(any());
        verifyNoInteractions(encoder);
        verifyNoInteractions(audit);
    }

    @Test
    void passwordUsesBcryptAndNeverReturnsPlaintext() {
        PasswordEncoder bcrypt = new BCryptPasswordEncoder();
        AuthService bcryptService = new AuthService(users, roles, userRoles, bcrypt, jwt, audit);
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setPassword("NewPass123");

        var response = bcryptService.updateCurrentUser(auth, request);

        var hash = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(user).setPasswordHash(hash.capture());
        assertThat(hash.getValue()).startsWith("$2").isNotEqualTo("NewPass123");
        assertThat(bcrypt.matches("NewPass123", hash.getValue())).isTrue();
        assertThat(response.toString()).doesNotContain("NewPass123", hash.getValue());
    }

    @Test
    void duplicateEmailUsesSharedConflict() {
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setEmail("taken@example.com");
        when(users.existsByEmailAndUserIdNot("taken@example.com", userId)).thenReturn(true);
        assertThatThrownBy(() -> service.updateCurrentUser(auth, request))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
        verify(users, never()).flush();
        verifyNoInteractions(audit);
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
    void unauthenticatedPrincipalIsRejected() {
        assertThatThrownBy(() -> service.getCurrentUser(null))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHENTICATED);
    }
}
