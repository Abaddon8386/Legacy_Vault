package com.legacyvault.auth;

import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthServiceTest {
    @Test
    void passwordLoginStillUsesDatabaseRolesAndSharedJwtResponse() {
        UserRepository users = mock(UserRepository.class);
        RoleRepository roles = mock(RoleRepository.class);
        UserRoleRepository userRoles = mock(UserRoleRepository.class);
        PasswordEncoder passwords = mock(PasswordEncoder.class);
        JwtService jwt = mock(JwtService.class);
        AuditService audit = mock(AuditService.class);
        AuthService service = new AuthService(users, roles, userRoles, passwords, jwt, audit);
        User user = mock(User.class);
        Role role = new Role();
        role.setRoleCode("ROLE_VAULT_OWNER");
        when(users.findByEmail("user@example.test")).thenReturn(Optional.of(user));
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.getDeletedAt()).thenReturn(null);
        when(user.getUserId()).thenReturn(12L);
        when(user.getPublicId()).thenReturn(UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
        when(user.getEmail()).thenReturn("user@example.test");
        when(user.getFullName()).thenReturn("Existing User");
        when(passwords.matches("StrongPass123", null)).thenReturn(true);
        UserRole userRole = mock(UserRole.class);
        when(userRole.getRole()).thenReturn(role);
        when(userRoles.findByUser_UserId(12L)).thenReturn(List.of(userRole));
        when(jwt.generateAccessToken(user.getPublicId(), user.getEmail(), List.of("ROLE_VAULT_OWNER")))
                .thenReturn("legacy-jwt");
        when(jwt.getExpirationSeconds()).thenReturn(3600L);

        LoginResponse result = service.login(new LoginRequest("user@example.test", "StrongPass123"));

        assertEquals("legacy-jwt", result.accessToken());
        assertEquals(3600L, result.expiresInSeconds());
        assertEquals(List.of("VAULT_OWNER"), result.user().roles());
        verify(jwt).generateAccessToken(user.getPublicId(), user.getEmail(), List.of("ROLE_VAULT_OWNER"));
        verify(audit).record(any());
    }

    @Test
    void passwordLoginStillRejectsLockedAccounts() {
        UserRepository users = mock(UserRepository.class);
        AuthService service = new AuthService(users, mock(RoleRepository.class), mock(UserRoleRepository.class),
                mock(PasswordEncoder.class), mock(JwtService.class), mock(AuditService.class));
        User user = mock(User.class);
        when(users.findByEmail("user@example.test")).thenReturn(Optional.of(user));
        when(user.getStatus()).thenReturn("LOCKED");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new LoginRequest("user@example.test", "StrongPass123")));

        assertEquals(ErrorCode.INVALID_CREDENTIALS, exception.getErrorCode());
    }
}
