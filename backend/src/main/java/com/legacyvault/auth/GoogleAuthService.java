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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/** Authenticates only explicitly linked Google subjects; it never creates or links user accounts. */
@Service
public class GoogleAuthService {
    private static final String GOOGLE_PROVIDER = "GOOGLE";

    private final GoogleIdTokenVerifier verifier;
    private final ExternalAuthIdentityRepository identities;
    private final GoogleLoginCredentialUseRepository credentialUses;
    private final AuthService authService;
    private final AuditService auditService;

    public GoogleAuthService(GoogleIdTokenVerifier verifier,
            ExternalAuthIdentityRepository identities,
            GoogleLoginCredentialUseRepository credentialUses,
            AuthService authService,
            AuditService auditService) {
        this.verifier = verifier;
        this.identities = identities;
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
            auditService.recordLoginFailure(user.getUserId());
            throw new BusinessException(ErrorCode.INVALID_GOOGLE_CREDENTIAL);
        }

        return authService.issueLoginResponseForActiveUser(user);
    }
}
