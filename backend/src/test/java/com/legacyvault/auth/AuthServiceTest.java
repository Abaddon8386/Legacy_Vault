package com.legacyvault.auth;

import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.PasswordReauthService;
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
        AuthService service = new AuthService(users, roles, userRoles, passwords, jwt, audit,
                mock(PasswordReauthService.class), mock(com.legacyvault.auth.emailverification.EmailVerificationService.class),
                mock(LoginAttemptLimiter.class));
        User user = mock(User.class);
        Role role = new Role();
        role.setRoleCode("ROLE_VAULT_OWNER");
        when(users.findByEmail("user@example.test")).thenReturn(Optional.of(user));
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.getDeletedAt()).thenReturn(null);
        when(user.isPasswordLoginAllowed()).thenReturn(true);
        when(user.getUserId()).thenReturn(12L);
        when(user.getPublicId()).thenReturn(UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
        when(user.getEmail()).thenReturn("user@example.test");
        when(user.getFullName()).thenReturn("Existing User");
        when(passwords.matches("StrongPass123", null)).thenReturn(true);
        UserRole userRole = mock(UserRole.class);
        when(userRole.getRole()).thenReturn(role);
        when(userRoles.findByUser_UserId(12L)).thenReturn(List.of(userRole));
        when(jwt.generateAccessToken(user.getPublicId(), user.getEmail(), List.of("ROLE_VAULT_OWNER"), 0))
                .thenReturn("legacy-jwt");
        when(jwt.getExpirationSeconds()).thenReturn(3600L);

        LoginResponse result = service.login(new LoginRequest("user@example.test", "StrongPass123"));

        assertEquals("legacy-jwt", result.accessToken());
        assertEquals(3600L, result.expiresInSeconds());
        assertEquals(List.of("VAULT_OWNER"), result.user().roles());
        verify(jwt).generateAccessToken(user.getPublicId(), user.getEmail(), List.of("ROLE_VAULT_OWNER"), 0);
        verify(audit).record(any());
    }

    @Test
    void lockedAccountWithAWrongPasswordGetsTheGenericFailure() {
        UserRepository users = mock(UserRepository.class);
        AuthService service = new AuthService(users, mock(RoleRepository.class), mock(UserRoleRepository.class),
                mock(PasswordEncoder.class), mock(JwtService.class), mock(AuditService.class),
                mock(PasswordReauthService.class), mock(com.legacyvault.auth.emailverification.EmailVerificationService.class),
                mock(LoginAttemptLimiter.class));
        User user = mock(User.class);
        when(users.findByEmail("user@example.test")).thenReturn(Optional.of(user));
        when(user.getStatus()).thenReturn("LOCKED");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new LoginRequest("user@example.test", "StrongPass123")));

        assertEquals(ErrorCode.INVALID_CREDENTIALS, exception.getErrorCode());
    }

    @Test
    void lockedAccountIsOnlyDisclosedWhenThePasswordIsCorrect() {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder passwords = mock(PasswordEncoder.class);
        AuditService audit = mock(AuditService.class);
        LoginAttemptLimiter limiter = mock(LoginAttemptLimiter.class);
        AuthService service = new AuthService(users, mock(RoleRepository.class), mock(UserRoleRepository.class),
                passwords, mock(JwtService.class), audit,
                mock(PasswordReauthService.class), mock(com.legacyvault.auth.emailverification.EmailVerificationService.class),
                limiter);
        User user = mock(User.class);
        when(users.findByEmail("user@example.test")).thenReturn(Optional.of(user));
        when(user.getUserId()).thenReturn(7L);
        when(user.getPasswordHash()).thenReturn("hash");
        when(user.getStatus()).thenReturn("LOCKED");
        when(user.isPasswordLoginAllowed()).thenReturn(true);
        when(passwords.matches("StrongPass123", "hash")).thenReturn(true);
        when(passwords.matches("WrongPass123", "hash")).thenReturn(false);

        BusinessException locked = assertThrows(BusinessException.class,
                () -> service.login(new LoginRequest("user@example.test", "StrongPass123")));
        BusinessException wrong = assertThrows(BusinessException.class,
                () -> service.login(new LoginRequest("user@example.test", "WrongPass123")));

        assertEquals(ErrorCode.ACCOUNT_LOCKED_BY_ADMIN, locked.getErrorCode());
        assertEquals(ErrorCode.INVALID_CREDENTIALS, wrong.getErrorCode());
        verify(audit, times(2)).recordLoginFailure(7L);
        verify(limiter, never()).clearFailures(any());
    }

    @Test
    void unknownEmailStillRunsPasswordCheckAndRecordsFailure() {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder passwords = mock(PasswordEncoder.class);
        LoginAttemptLimiter limiter = mock(LoginAttemptLimiter.class);
        when(passwords.encode(any())).thenReturn("dummy-bcrypt-hash");
        AuthService service = new AuthService(users, mock(RoleRepository.class), mock(UserRoleRepository.class),
                passwords, mock(JwtService.class), mock(AuditService.class),
                mock(PasswordReauthService.class), mock(com.legacyvault.auth.emailverification.EmailVerificationService.class),
                limiter);
        when(users.findByEmail("nobody@example.test")).thenReturn(Optional.empty());

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new LoginRequest("nobody@example.test", "WhateverPass1"), "203.0.113.9"));

        assertEquals(ErrorCode.INVALID_CREDENTIALS, exception.getErrorCode());
        verify(passwords).matches("WhateverPass1", "dummy-bcrypt-hash");
        verify(limiter).reserveAttempt("nobody@example.test", "203.0.113.9");
        verify(limiter, never()).clearFailures(anyString());
    }

    @Test
    void loginCountsFullWidthAndMixedCaseEmailsUnderTheSameLockoutKey() {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder passwords = mock(PasswordEncoder.class);
        LoginAttemptLimiter limiter = mock(LoginAttemptLimiter.class);
        when(passwords.encode(any())).thenReturn("dummy-bcrypt-hash");
        AuthService service = new AuthService(users, mock(RoleRepository.class), mock(UserRoleRepository.class),
                passwords, mock(JwtService.class), mock(AuditService.class),
                mock(PasswordReauthService.class), mock(com.legacyvault.auth.emailverification.EmailVerificationService.class),
                limiter);
        when(users.findByEmail("nobody@example.test")).thenReturn(Optional.empty());

        // "NOBODY@Example.TEST" with a full-width first letter.
        assertThrows(BusinessException.class,
                () -> service.login(new LoginRequest("Ｎobody@Example.TEST", "WhateverPass1"), "203.0.113.9"));

        verify(limiter).reserveAttempt("nobody@example.test", "203.0.113.9");
    }

    @Test
    void loginIsBlockedBeforeAnyPasswordCheckWhenOverTheLimit() {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder passwords = mock(PasswordEncoder.class);
        LoginAttemptLimiter limiter = mock(LoginAttemptLimiter.class);
        when(limiter.reserveAttempt("user@example.test", "203.0.113.9"))
                .thenThrow(new BusinessException(ErrorCode.TOO_MANY_ATTEMPTS));
        AuthService service = new AuthService(users, mock(RoleRepository.class), mock(UserRoleRepository.class),
                passwords, mock(JwtService.class), mock(AuditService.class),
                mock(PasswordReauthService.class), mock(com.legacyvault.auth.emailverification.EmailVerificationService.class),
                limiter);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new LoginRequest("user@example.test", "StrongPass123"), "203.0.113.9"));

        assertEquals(ErrorCode.TOO_MANY_ATTEMPTS, exception.getErrorCode());
        verify(users, never()).findByEmail(any());
        verify(passwords, never()).matches(any(), any());
    }

    @Test
    void wrongPasswordRecordsFailureForEmailAndIp() {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder passwords = mock(PasswordEncoder.class);
        LoginAttemptLimiter limiter = mock(LoginAttemptLimiter.class);
        AuthService service = new AuthService(users, mock(RoleRepository.class), mock(UserRoleRepository.class),
                passwords, mock(JwtService.class), mock(AuditService.class),
                mock(PasswordReauthService.class), mock(com.legacyvault.auth.emailverification.EmailVerificationService.class),
                limiter);
        User user = mock(User.class);
        when(users.findByEmail("user@example.test")).thenReturn(Optional.of(user));
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.isPasswordLoginAllowed()).thenReturn(true);
        when(user.getPasswordHash()).thenReturn("real-hash");
        when(passwords.matches("WrongPass123", "real-hash")).thenReturn(false);

        assertThrows(BusinessException.class,
                () -> service.login(new LoginRequest("user@example.test", "WrongPass123"), "203.0.113.9"));

        verify(limiter).reserveAttempt("user@example.test", "203.0.113.9");
        verify(limiter, never()).clearFailures(anyString());
    }

    @Test
    void successfulLoginReleasesItsReservation() {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder passwords = mock(PasswordEncoder.class);
        JwtService jwt = mock(JwtService.class);
        LoginAttemptLimiter limiter = mock(LoginAttemptLimiter.class);
        UserRoleRepository userRoles = mock(UserRoleRepository.class);
        AuthService service = new AuthService(users, mock(RoleRepository.class), userRoles, passwords, jwt,
                mock(AuditService.class), mock(PasswordReauthService.class),
                mock(com.legacyvault.auth.emailverification.EmailVerificationService.class), limiter);
        User user = mock(User.class);
        Role role = new Role();
        role.setRoleCode("ROLE_VAULT_OWNER");
        UserRole userRole = mock(UserRole.class);
        when(userRole.getRole()).thenReturn(role);
        when(userRoles.findByUser_UserId(12L)).thenReturn(List.of(userRole));
        when(users.findByEmail("user@example.test")).thenReturn(Optional.of(user));
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.isPasswordLoginAllowed()).thenReturn(true);
        when(user.getUserId()).thenReturn(12L);
        when(user.getPublicId()).thenReturn(UUID.randomUUID());
        when(user.getEmail()).thenReturn("user@example.test");
        when(user.getPasswordHash()).thenReturn("real-hash");
        when(passwords.matches("StrongPass123", "real-hash")).thenReturn(true);
        when(jwt.generateAccessToken(any(), any(), any(), anyInt())).thenReturn("jwt");
        when(limiter.reserveAttempt("user@example.test", "203.0.113.9")).thenReturn(41L);

        service.login(new LoginRequest("user@example.test", "StrongPass123"), "203.0.113.9");

        verify(limiter).clearFailures("user@example.test");
    }
}
