package com.legacyvault.auth;

import com.legacyvault.audit.AuditService;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.auth.dto.GoogleLoginRequest;
import com.legacyvault.auth.dto.GoogleIdentityLinkResponse;
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

/** Authenticates explicitly linked Google subjects and supports authenticated self-linking only. */
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

    /** Links only a verified Google subject to the authenticated account; never links by email. */
    @Transactional
    public GoogleIdentityLinkResponse linkIdentity(GoogleLoginRequest request, Long authenticatedUserId) {
        User user = users.findById(authenticatedUserId)
                .filter(found -> "ACTIVE".equals(found.getStatus()) && found.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));

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
