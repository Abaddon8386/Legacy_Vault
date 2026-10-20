package com.legacyvault.auth;

import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.dto.GoogleLoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.auth.entity.GoogleLoginCredentialUse;
import com.legacyvault.auth.repository.GoogleLoginCredentialUseRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.ExternalAuthIdentity;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.ExternalAuthIdentityRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class GoogleAuthServiceTest {
    private final GoogleIdTokenVerifier verifier = mock(GoogleIdTokenVerifier.class);
    private final ExternalAuthIdentityRepository identities = mock(ExternalAuthIdentityRepository.class);
    private final GoogleLoginCredentialUseRepository uses = mock(GoogleLoginCredentialUseRepository.class);
    private final AuthService authService = mock(AuthService.class);
    private final AuditService audit = mock(AuditService.class);
    private final GoogleAuthService service = new GoogleAuthService(verifier, identities, uses, authService, audit);
    private final User user = mock(User.class);
    private final String token = "synthetic.signed.credential";
    private final GoogleIdTokenVerifier.VerifiedGoogleCredential verified =
            new GoogleIdTokenVerifier.VerifiedGoogleCredential("google-sub", "a".repeat(64), Instant.now().plusSeconds(300));
    private final LoginResponse response = new LoginResponse("legacy-jwt", "Bearer", 3600,
            new LoginResponse.AuthUserResponse(UUID.randomUUID(), "Linked User", "linked@example.test", java.util.List.of("VAULT_OWNER")));

    @BeforeEach
    void setUp() {
        when(verifier.verify(token)).thenReturn(verified);
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.getDeletedAt()).thenReturn(null);
        when(user.getUserId()).thenReturn(41L);
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub"))
                .thenReturn(Optional.of(new ExternalAuthIdentity("GOOGLE", "google-sub", user)));
        when(authService.issueLoginResponseForActiveUser(user)).thenReturn(response);
    }

    @Test
    void linkedActiveGoogleSubjectReturnsSharedLoginResponseAndConsumesCredentialOnce() {
        assertSame(response, service.login(new GoogleLoginRequest(token)));

        verify(uses).deleteByExpiresAtLessThanEqual(any(LocalDateTime.class));
        verify(uses).saveAndFlush(any(GoogleLoginCredentialUse.class));
        verify(authService).issueLoginResponseForActiveUser(user);
        verify(identities).findByProviderCodeAndSubject("GOOGLE", "google-sub");
        verifyNoInteractions(audit);
    }

    @Test
    void unlinkedGoogleSubjectIsRejectedWithoutEmailBasedLinking() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.INVALID_CREDENTIALS, exception.getErrorCode());
        verify(audit).recordLoginFailure(null);
        verifyNoInteractions(uses, authService);
    }

    @Test
    void inactiveOrDeletedLinkedAccountIsRejected() {
        when(user.getStatus()).thenReturn("LOCKED");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.INVALID_CREDENTIALS, exception.getErrorCode());
        verify(audit).recordLoginFailure(41L);
        verifyNoInteractions(uses, authService);
    }

    @Test
    void softDeletedLinkedAccountIsRejected() {
        when(user.getDeletedAt()).thenReturn(LocalDateTime.now());

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.INVALID_CREDENTIALS, exception.getErrorCode());
        verify(audit).recordLoginFailure(41L);
        verifyNoInteractions(uses, authService);
    }

    @Test
    void reusedCredentialCannotMintAnotherSession() {
        when(uses.saveAndFlush(any(GoogleLoginCredentialUse.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate fingerprint"));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, exception.getErrorCode());
        verify(audit).recordLoginFailure(41L);
        verifyNoInteractions(authService);
    }

    @Test
    void loginRunsAsOneTransactionForCredentialUseAndAudit() throws Exception {
        assertTrue(GoogleAuthService.class.getMethod("login", GoogleLoginRequest.class)
                .isAnnotationPresent(Transactional.class));
    }
}
