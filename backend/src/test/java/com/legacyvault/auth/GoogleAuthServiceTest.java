package com.legacyvault.auth;

import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.dto.GoogleLoginRequest;
import com.legacyvault.auth.dto.GoogleIdentityLinkResponse;
import com.legacyvault.auth.dto.PasswordSetupRequest;
import com.legacyvault.auth.dto.PasswordSetupResponse;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.auth.entity.GoogleLoginCredentialUse;
import com.legacyvault.auth.repository.GoogleLoginCredentialUseRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.ExternalAuthIdentity;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.ExternalAuthIdentityRepository;
import com.legacyvault.user.repository.UserRepository;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class GoogleAuthServiceTest {
    private final GoogleIdTokenVerifier verifier = mock(GoogleIdTokenVerifier.class);
    private final ExternalAuthIdentityRepository identities = mock(ExternalAuthIdentityRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final GoogleLoginCredentialUseRepository uses = mock(GoogleLoginCredentialUseRepository.class);
    private final AuthService authService = mock(AuthService.class);
    private final AuditService audit = mock(AuditService.class);
    private final GoogleAuthService service = new GoogleAuthService(verifier, identities, users, uses, authService, audit);
    private final User user = mock(User.class);
    private final String token = "synthetic.signed.credential";
    private final GoogleIdTokenVerifier.VerifiedGoogleCredential verified =
            new GoogleIdTokenVerifier.VerifiedGoogleCredential("google-sub", "a".repeat(64), Instant.now().plusSeconds(300), null, false, null);
    private final LoginResponse response = new LoginResponse("legacy-jwt", "Bearer", 3600,
            new LoginResponse.AuthUserResponse(UUID.randomUUID(), "Linked User", "linked@example.test", java.util.List.of("VAULT_OWNER")));

    @BeforeEach
    void setUp() {
        when(verifier.verify(token)).thenReturn(verified);
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.getDeletedAt()).thenReturn(null);
        when(user.getUserId()).thenReturn(41L);
        when(user.isPasswordLoginAllowed()).thenReturn(true);
        when(users.findById(41L)).thenReturn(Optional.of(user));
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

    private GoogleIdTokenVerifier.VerifiedGoogleCredential newcomer(String email, boolean emailVerified) {
        return new GoogleIdTokenVerifier.VerifiedGoogleCredential(
                "google-sub", "c".repeat(64), Instant.now().plusSeconds(300), email, emailVerified, "New Person");
    }

    @Test
    void newGoogleUserWithUnusedVerifiedEmailGetsOwnerAccountAndLogsIn() {
        User created = mock(User.class);
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());
        when(verifier.verify(token)).thenReturn(newcomer("  New.Person@Example.test ", true));
        when(users.existsByEmail("new.person@example.test")).thenReturn(false);
        when(authService.createGoogleOwner("new.person@example.test", "New Person")).thenReturn(created);
        when(authService.issueLoginResponseForActiveUser(created)).thenReturn(response);

        assertSame(response, service.login(new GoogleLoginRequest(token)));

        verify(uses).saveAndFlush(any(GoogleLoginCredentialUse.class));
        verify(identities).saveAndFlush(argThat(identity -> "GOOGLE".equals(identity.getProviderCode())
                && "google-sub".equals(identity.getSubject()) && identity.getUser() == created));
    }

    @Test
    void existingEmailIsNeverMergedAndCreatesNothing() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());
        when(verifier.verify(token)).thenReturn(newcomer("owner@example.test", true));
        when(users.existsByEmail("owner@example.test")).thenReturn(true);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED, exception.getErrorCode());
        verify(authService, never()).createGoogleOwner(any(), any());
        verify(identities, never()).saveAndFlush(any());
        verifyNoInteractions(uses);
    }

    @Test
    void unverifiedGoogleEmailIsRejectedWithoutCreatingAnything() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());
        when(verifier.verify(token)).thenReturn(newcomer("new@example.test", false));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.GOOGLE_EMAIL_NOT_VERIFIED, exception.getErrorCode());
        verify(authService, never()).createGoogleOwner(any(), any());
        verifyNoInteractions(uses);
    }

    @Test
    void tokenWithoutEmailCannotSignUp() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());
        when(verifier.verify(token)).thenReturn(newcomer(null, true));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, exception.getErrorCode());
        verify(authService, never()).createGoogleOwner(any(), any());
    }

    @Test
    void reusedCredentialCannotSignUpTwice() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());
        when(verifier.verify(token)).thenReturn(newcomer("new@example.test", true));
        when(uses.saveAndFlush(any(GoogleLoginCredentialUse.class)))
                .thenThrow(dataViolation("PK_google_login_credential_uses"));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, exception.getErrorCode());
        verify(authService, never()).createGoogleOwner(any(), any());
    }

    @Test
    void concurrentSignUpLoserGetsEmailAlreadyRegistered() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());
        when(verifier.verify(token)).thenReturn(newcomer("new@example.test", true));
        when(authService.createGoogleOwner(any(), any())).thenThrow(dataViolation("UQ_users_email"));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED, exception.getErrorCode());
        // Marked as a race so the controller retries instead of telling the user to "sign in with a password".
        assertInstanceOf(GoogleSignupRaceException.class, exception);
        verify(authService, never()).issueLoginResponseForActiveUser(any());
    }

    @Test
    void emailTakenByAParallelRequestForTheSameGoogleIdentityIsMarkedAsARaceNotAPasswordConflict() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub"))
                .thenReturn(Optional.empty(), Optional.of(new ExternalAuthIdentity("GOOGLE", "google-sub", user)));
        when(verifier.verify(token)).thenReturn(newcomer("new@example.test", true));
        when(users.existsByEmail("new@example.test")).thenReturn(true);

        assertThrows(GoogleSignupRaceException.class, () -> service.login(new GoogleLoginRequest(token)));

        verify(authService, never()).createGoogleOwner(any(), any());
        verifyNoInteractions(uses);
    }

    @Test
    void existingEmailIsNotMarkedAsARace() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());
        when(verifier.verify(token)).thenReturn(newcomer("owner@example.test", true));
        when(users.existsByEmail("owner@example.test")).thenReturn(true);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertFalse(exception instanceof GoogleSignupRaceException);
    }

    @Test
    void linkRejectsGoogleOnlyAccountBeforeTouchingTheCredential() {
        when(user.isPasswordLoginAllowed()).thenReturn(false);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.linkIdentity(new GoogleLoginRequest(token), 41L));

        assertEquals(ErrorCode.PASSWORD_NOT_SET, exception.getErrorCode());
        verifyNoInteractions(verifier, uses, audit);
        verify(identities, never()).saveAndFlush(any());
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
                .thenThrow(dataViolation("PK_google_login_credential_uses"));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.login(new GoogleLoginRequest(token)));

        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, exception.getErrorCode());
        verify(audit).recordLoginFailure(41L);
        verifyNoInteractions(authService);
    }

    @Test
    void loginDoesNotTreatOtherDatabaseIntegrityErrorsAsCredentialReplay() {
        DataIntegrityViolationException failure = new DataIntegrityViolationException("foreign key failed");
        when(uses.saveAndFlush(any(GoogleLoginCredentialUse.class))).thenThrow(failure);

        assertSame(failure, assertThrows(DataIntegrityViolationException.class,
                () -> service.login(new GoogleLoginRequest(token))));
        verifyNoInteractions(authService);
        verify(audit, never()).recordLoginFailure(any());
    }

    @Test
    void loginRunsAsOneTransactionForCredentialUseAndAudit() throws Exception {
        assertTrue(GoogleAuthService.class.getMethod("login", GoogleLoginRequest.class)
                .isAnnotationPresent(Transactional.class));
    }

    @Test
    void authenticatedActiveAccountCanLinkVerifiedSubjectAndLoginThroughNewMapping() {
        AtomicReference<ExternalAuthIdentity> mapping = new AtomicReference<>();
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub"))
                .thenAnswer(invocation -> Optional.ofNullable(mapping.get()));
        when(identities.saveAndFlush(any(ExternalAuthIdentity.class))).thenAnswer(invocation -> {
            ExternalAuthIdentity saved = invocation.getArgument(0);
            mapping.set(saved);
            return saved;
        });
        GoogleIdTokenVerifier.VerifiedGoogleCredential loginCredential =
                new GoogleIdTokenVerifier.VerifiedGoogleCredential("google-sub", "b".repeat(64), Instant.now().plusSeconds(300), null, false, null);
        when(verifier.verify("new-google-token")).thenReturn(verified);
        when(verifier.verify("next-google-token")).thenReturn(loginCredential);

        GoogleIdentityLinkResponse linked = service.linkIdentity(new GoogleLoginRequest("new-google-token"), 41L);
        assertTrue(linked.linked());
        assertSame(user, mapping.get().getUser());
        assertEquals("google-sub", mapping.get().getSubject());
        verify(uses, times(1)).saveAndFlush(any(GoogleLoginCredentialUse.class));
        verify(audit).record(argThat(event -> event.action().name().equals("AUTH_GOOGLE_IDENTITY_LINKED")
                && event.actorUserId().equals(41L)
                && event.context().equals(java.util.Map.of("provider", "GOOGLE"))
                && !event.stateAfter().contains("google-sub")));

        assertSame(response, service.login(new GoogleLoginRequest("next-google-token")));
        verify(authService).issueLoginResponseForActiveUser(user);
    }

    @Test
    void linkRejectsIdentityAlreadyLinkedToAnyAccount() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub"))
                .thenReturn(Optional.of(new ExternalAuthIdentity("GOOGLE", "google-sub", user)));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.linkIdentity(new GoogleLoginRequest(token), 41L));

        assertEquals(ErrorCode.GOOGLE_IDENTITY_ALREADY_LINKED, exception.getErrorCode());
        verifyNoInteractions(uses, audit);
        verify(identities, never()).saveAndFlush(any());
    }

    @Test
    void linkRejectsInactiveOrDeletedAuthenticatedAccount() {
        when(user.getStatus()).thenReturn("LOCKED");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.linkIdentity(new GoogleLoginRequest(token), 41L));

        assertEquals(ErrorCode.UNAUTHENTICATED, exception.getErrorCode());
        verifyNoInteractions(verifier, identities, uses, audit);
    }

    @Test
    void linkRejectsSoftDeletedAuthenticatedAccount() {
        when(user.getDeletedAt()).thenReturn(LocalDateTime.now());

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.linkIdentity(new GoogleLoginRequest(token), 41L));

        assertEquals(ErrorCode.UNAUTHENTICATED, exception.getErrorCode());
        verifyNoInteractions(verifier, identities, uses, audit);
    }

    @Test
    void linkRejectsAccountMissingFromDatabase() {
        when(users.findById(41L)).thenReturn(Optional.empty());

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.linkIdentity(new GoogleLoginRequest(token), 41L));

        assertEquals(ErrorCode.UNAUTHENTICATED, exception.getErrorCode());
        verifyNoInteractions(verifier, identities, uses, audit);
    }

    @Test
    void linkMapsConcurrentUniqueConstraintViolationToConflict() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub"))
                .thenReturn(Optional.empty());
        when(identities.saveAndFlush(any(ExternalAuthIdentity.class)))
                .thenThrow(dataViolation("UQ_external_auth_identities_provider_subject"));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.linkIdentity(new GoogleLoginRequest(token), 41L));

        assertEquals(ErrorCode.GOOGLE_IDENTITY_ALREADY_LINKED, exception.getErrorCode());
        verify(audit, never()).record(any());
    }

    @Test
    void linkDuplicateCredentialIsRejectedAsReplayBeforeIdentityConflictHandling() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub"))
                .thenReturn(Optional.empty());
        when(uses.saveAndFlush(any(GoogleLoginCredentialUse.class)))
                .thenThrow(dataViolation("PK_google_login_credential_uses"));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.linkIdentity(new GoogleLoginRequest(token), 41L));

        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, exception.getErrorCode());
        verify(identities, never()).saveAndFlush(any());
    }

    @Test
    void linkDoesNotMapUnrelatedIdentityDatabaseFailureToAlreadyLinked() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub"))
                .thenReturn(Optional.empty());
        DataIntegrityViolationException failure = new DataIntegrityViolationException("foreign key failed");
        when(identities.saveAndFlush(any(ExternalAuthIdentity.class))).thenThrow(failure);

        assertSame(failure, assertThrows(DataIntegrityViolationException.class,
                () -> service.linkIdentity(new GoogleLoginRequest(token), 41L)));
        verify(audit, never()).record(any());
    }

    @Test
    void linkRunsInTransaction() throws Exception {
        assertTrue(GoogleAuthService.class.getMethod("linkIdentity", GoogleLoginRequest.class, Long.class)
                .isAnnotationPresent(Transactional.class));
    }

    @Test
    void passwordSetupWithCredentialOfTheSignedInAccountsGoogleIdentitySetsPasswordAndConsumesToken() {
        PasswordSetupResponse done = new PasswordSetupResponse(true);
        when(authService.setupPassword(41L, "StrongPass123")).thenReturn(done);

        assertSame(done, service.setupPassword(41L, new PasswordSetupRequest("StrongPass123", token)));

        verify(uses).saveAndFlush(any(GoogleLoginCredentialUse.class));
        verify(authService).setupPassword(41L, "StrongPass123");
        verify(audit, never()).recordLoginFailure(any());
    }

    @Test
    void passwordSetupRejectsCredentialOfAnotherAccountsGoogleIdentity() {
        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.setupPassword(99L, new PasswordSetupRequest("StrongPass123", token)));

        assertEquals(ErrorCode.GOOGLE_IDENTITY_MISMATCH, exception.getErrorCode());
        verifyNoInteractions(uses);
        verify(authService, never()).setupPassword(any(), any());
    }

    @Test
    void passwordSetupRejectsCredentialWhoseSubjectIsNotLinkedToAnyAccount() {
        when(identities.findByProviderCodeAndSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.setupPassword(41L, new PasswordSetupRequest("StrongPass123", token)));

        assertEquals(ErrorCode.GOOGLE_IDENTITY_MISMATCH, exception.getErrorCode());
        verify(authService, never()).setupPassword(any(), any());
    }

    @Test
    void passwordSetupRejectsInvalidOrExpiredCredential() {
        when(verifier.verify("bad-token")).thenThrow(new BusinessException(ErrorCode.INVALID_GOOGLE_CREDENTIAL));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.setupPassword(41L, new PasswordSetupRequest("StrongPass123", "bad-token")));

        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, exception.getErrorCode());
        verifyNoInteractions(uses);
        verify(authService, never()).setupPassword(any(), any());
    }

    @Test
    void passwordSetupRejectsAlreadyUsedCredentialWithoutTouchingThePassword() {
        when(uses.saveAndFlush(any(GoogleLoginCredentialUse.class)))
                .thenThrow(dataViolation("PK_google_login_credential_uses"));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.setupPassword(41L, new PasswordSetupRequest("StrongPass123", token)));

        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, exception.getErrorCode());
        verify(authService, never()).setupPassword(any(), any());
        verify(audit, never()).recordLoginFailure(any());
    }

    @Test
    void passwordSetupFailureAfterTokenCheckPropagatesSoTheTransactionRollsBack() {
        when(authService.setupPassword(41L, "StrongPass123"))
                .thenThrow(new BusinessException(ErrorCode.PASSWORD_ALREADY_SET));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.setupPassword(41L, new PasswordSetupRequest("StrongPass123", token)));

        assertEquals(ErrorCode.PASSWORD_ALREADY_SET, exception.getErrorCode());
    }

    @Test
    void passwordSetupRunsAsOneTransaction() throws Exception {
        assertTrue(GoogleAuthService.class.getMethod("setupPassword", Long.class, PasswordSetupRequest.class)
                .isAnnotationPresent(Transactional.class));
    }

    private static DataIntegrityViolationException dataViolation(String constraint) {
        return new DataIntegrityViolationException("constraint violation",
                new ConstraintViolationException("constraint violation", null, constraint));
    }
}
