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
    void unauthenticatedPrincipalIsRejected() {
        assertThatThrownBy(() -> service.getCurrentUser(null))
                .isInstanceOfSatisfying(com.legacyvault.common.error.BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.UNAUTHENTICATED));
    }
}
