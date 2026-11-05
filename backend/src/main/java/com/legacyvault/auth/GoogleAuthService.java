package com.legacyvault.auth;

import com.legacyvault.audit.AuditService;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;

/**
 * Signs in linked Google subjects, creates an Owner account for a brand-new Google user whose email is not yet
 * registered, and supports authenticated self-linking. It never links an existing account by email.
 */
@Service
public class GoogleAuthService {
    private static final String GOOGLE_PROVIDER = "GOOGLE";

    private final GoogleIdTokenVerifier verifier;
    private final ExternalAuthIdentityRepository identities;
    private final UserRepository users;
    private final GoogleLoginCredentialUseRepository credentialUses;
    private final AuthService authService;
    private final AuditService auditService;

    public GoogleAuthService(GoogleIdTokenVerifier verifier,
            ExternalAuthIdentityRepository identities,
            UserRepository users,
            GoogleLoginCredentialUseRepository credentialUses,
            AuthService authService,
            AuditService auditService) {
        this.verifier = verifier;
        this.identities = identities;
        this.users = users;
        this.credentialUses = credentialUses;
        this.authService = authService;
        this.auditService = auditService;
    }

    @Transactional
    public LoginResponse login(GoogleLoginRequest request) {
        GoogleIdTokenVerifier.VerifiedGoogleCredential credential;
        try {
            credential = verifier.verify(request.credential());
        } catch (BusinessException exception) {
            if (exception.getErrorCode() == ErrorCode.INVALID_GOOGLE_CREDENTIAL) {
                auditService.recordLoginFailure(null);
            }
            throw exception;
        }

        ExternalAuthIdentity identity = identities
                .findByProviderCodeAndSubject(GOOGLE_PROVIDER, credential.subject())
                .orElse(null);
        User user = identity == null ? null : identity.getUser();
        if (identity == null) {
            return signUp(credential);
        }
        if (user == null || !"ACTIVE".equals(user.getStatus()) || user.getDeletedAt() != null) {
            auditService.recordLoginFailure(user == null ? null : user.getUserId());
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        credentialUses.deleteByExpiresAtLessThanEqual(now);
        try {
            credentialUses.saveAndFlush(new GoogleLoginCredentialUse(
                    credential.credentialHash(), LocalDateTime.ofInstant(credential.expiresAt(), ZoneOffset.UTC)));
        } catch (DataIntegrityViolationException exception) {
            if (!violatesConstraint(exception, "PK_google_login_credential_uses")) {
                throw exception;
            }
            auditService.recordLoginFailure(user.getUserId());
            throw new BusinessException(ErrorCode.INVALID_GOOGLE_CREDENTIAL);
        }

        return authService.issueLoginResponseForActiveUser(user);
    }

    /** First-time Google sign-in: unknown subject. Everything runs in the caller's single transaction. */
    private LoginResponse signUp(GoogleIdTokenVerifier.VerifiedGoogleCredential credential) {
        if (!credential.emailVerified()) {
            throw new BusinessException(ErrorCode.GOOGLE_EMAIL_NOT_VERIFIED);
        }
        String rawEmail = credential.email();
        if (rawEmail == null || rawEmail.isBlank() || rawEmail.indexOf('@') <= 0) {
            throw new BusinessException(ErrorCode.INVALID_GOOGLE_CREDENTIAL);
        }
        String email = EmailNormalizer.normalize(rawEmail);
        if (users.existsByEmail(email)) {
            // A parallel request for this very Google identity may have committed the account between our identity
            // lookup and this check (SQL Server blocks the email read until it commits). Re-read the identity: if it
            // exists now this is that race, so the caller retries and signs the same Google user in.
            if (identities.findByProviderCodeAndSubject(GOOGLE_PROVIDER, credential.subject()).isPresent()) {
                throw new GoogleSignupRaceException();
            }
            // Never merge by email: the owner proves control with the password, then links Google from the profile.
            throw new BusinessException(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED);
        }

        consumeCredential(credential, null, true);

        User created;
        try {
            created = authService.createGoogleOwner(email, credential.name());
            identities.saveAndFlush(new ExternalAuthIdentity(GOOGLE_PROVIDER, credential.subject(), created));
        } catch (DataIntegrityViolationException exception) {
            // A parallel request with another token created the same email or subject first; unique indexes decide.
            // This transaction is now rolled back, so the caller retries once: if the winner is the same Google
            // user the retry signs them in, and if the email really belongs to someone else it gets the real 409.
            if (violatesConstraint(exception, "UQ_users_email")
                    || violatesConstraint(exception, "UQ_external_auth_identities_provider_subject")) {
                throw new GoogleSignupRaceException();
            }
            throw exception;
        }
        return authService.issueLoginResponseForActiveUser(created);
    }

    private void consumeCredential(GoogleIdTokenVerifier.VerifiedGoogleCredential credential, User user,
            boolean auditReplayAsLoginFailure) {
        credentialUses.deleteByExpiresAtLessThanEqual(LocalDateTime.now(ZoneOffset.UTC));
        try {
            credentialUses.saveAndFlush(new GoogleLoginCredentialUse(
                    credential.credentialHash(), LocalDateTime.ofInstant(credential.expiresAt(), ZoneOffset.UTC)));
        } catch (DataIntegrityViolationException exception) {
            if (!violatesConstraint(exception, "PK_google_login_credential_uses")) {
                throw exception;
            }
            if (auditReplayAsLoginFailure) {
                auditService.recordLoginFailure(user == null ? null : user.getUserId());
            }
            throw new BusinessException(ErrorCode.INVALID_GOOGLE_CREDENTIAL);
        }
    }

    /**
     * First password for a Google-only account. Requires a fresh Google ID token whose subject is linked to the
     * signed-in account, so a session alone is not enough. The token is consumed in the same transaction as the
     * password change; if the password step fails (policy, already set) everything rolls back and the token stays usable.
     */
    @Transactional
    public PasswordSetupResponse setupPassword(Long authenticatedUserId, PasswordSetupRequest request) {
        GoogleIdTokenVerifier.VerifiedGoogleCredential credential = verifier.verify(request.credential());
        ExternalAuthIdentity identity = identities
                .findByProviderCodeAndSubject(GOOGLE_PROVIDER, credential.subject())
                .orElse(null);
        if (identity == null || identity.getUser() == null
                || !authenticatedUserId.equals(identity.getUser().getUserId())) {
            throw new BusinessException(ErrorCode.GOOGLE_IDENTITY_MISMATCH);
        }
        consumeCredential(credential, null, false);
        return authService.setupPassword(authenticatedUserId, request.password());
    }

    /** Links only a verified Google subject to the authenticated account; never links by email. */
    @Transactional
    public GoogleIdentityLinkResponse linkIdentity(GoogleLoginRequest request, Long authenticatedUserId) {
        User user = users.findById(authenticatedUserId)
                .filter(found -> "ACTIVE".equals(found.getStatus()) && found.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
        // A Google-only account (no password yet) must not add another Google identity: that would let a bare
        // session sidestep the re-authentication that setting the first password requires. Set a password first.
        if (!user.isPasswordLoginAllowed()) {
            throw new BusinessException(ErrorCode.PASSWORD_NOT_SET);
        }

        GoogleIdTokenVerifier.VerifiedGoogleCredential credential = verifier.verify(request.credential());
        if (identities.findByProviderCodeAndSubject(GOOGLE_PROVIDER, credential.subject()).isPresent()) {
            throw new BusinessException(ErrorCode.GOOGLE_IDENTITY_ALREADY_LINKED);
        }

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        credentialUses.deleteByExpiresAtLessThanEqual(now);
        try {
            credentialUses.saveAndFlush(new GoogleLoginCredentialUse(
                    credential.credentialHash(), LocalDateTime.ofInstant(credential.expiresAt(), ZoneOffset.UTC)));
        } catch (DataIntegrityViolationException exception) {
            if (!violatesConstraint(exception, "PK_google_login_credential_uses")) {
                throw exception;
            }
            throw new BusinessException(ErrorCode.INVALID_GOOGLE_CREDENTIAL);
        }

        try {
            identities.saveAndFlush(new ExternalAuthIdentity(GOOGLE_PROVIDER, credential.subject(), user));
        } catch (DataIntegrityViolationException exception) {
            if (!violatesConstraint(exception, "UQ_external_auth_identities_provider_subject")) {
                throw exception;
            }
            // The database unique constraint is the final guard against concurrent link requests.
            throw new BusinessException(ErrorCode.GOOGLE_IDENTITY_ALREADY_LINKED);
        }

        auditService.record(new AuditEvent(
                AuditAction.AUTH_GOOGLE_IDENTITY_LINKED,
                AuditActorType.USER,
                user.getUserId(),
                null,
                "USER",
                user.getUserId(),
                null,
                "{\"googleIdentityLinked\":true}",
                null,
                Map.of("provider", GOOGLE_PROVIDER),
                "AUTH_GOOGLE_LINKED",
                null));

        return new GoogleIdentityLinkResponse(true);
    }

    private static boolean violatesConstraint(DataIntegrityViolationException exception, String expectedName) {
        Throwable cause = exception;
        while (cause != null) {
            if (cause instanceof ConstraintViolationException violation
                    && expectedName.equalsIgnoreCase(violation.getConstraintName())) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }
}
