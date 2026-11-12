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
 * Dịch vụ xác thực bằng Google (được {@link AuthController} gọi qua {@code POST /api/v1/auth/google},
 * {@code /google/link} và {@code /password/setup}). Đăng nhập cho subject Google đã liên kết, tự tạo tài khoản Owner
 * cho người dùng Google mới có email chưa đăng ký, và hỗ trợ tự liên kết khi đã đăng nhập. Không bao giờ liên kết
 * tài khoản có sẵn theo email. Dùng bảng {@code external_auth_identities}, {@code users} và
 * {@code google_login_credential_uses} (chống phát lại token); ghi audit {@code AUTH_GOOGLE_IDENTITY_LINKED} và các
 * sự kiện đăng nhập thất bại.
 */
@Service
public class GoogleAuthService {
    /**
     * Mã nhà cung cấp lưu trong {@code external_auth_identities.provider_code}.
     */
    private static final String GOOGLE_PROVIDER = "GOOGLE";

    /**
     * Bộ xác minh chữ ký và claim của ID token Google.
     */
    private final GoogleIdTokenVerifier verifier;
    /**
     * Truy cập bảng danh tính ngoài (provider + subject).
     */
    private final ExternalAuthIdentityRepository identities;
    /**
     * Truy cập bảng {@code users}.
     */
    private final UserRepository users;
    /**
     * Lưu dấu token đã dùng để chống replay.
     */
    private final GoogleLoginCredentialUseRepository credentialUses;
    /**
     * Dùng để tạo tài khoản Owner, phát hành JWT và đặt mật khẩu.
     */
    private final AuthService authService;
    /**
     * Ghi nhật ký kiểm toán.
     */
    private final AuditService auditService;

    /**
     * Khởi tạo dịch vụ với các phụ thuộc được Spring tiêm vào.
     */
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

    /**
     * Đăng nhập bằng Google ({@code POST /api/v1/auth/google}). Xác minh token; nếu subject chưa liên kết thì
     * đăng ký mới qua {@link #signUp}; nếu đã liên kết thì kiểm tra tài khoản (bị khóa bởi admin thì báo
     * {@code ACCOUNT_LOCKED_BY_ADMIN} vì credential đã được xác minh), ghi dấu token dùng một lần (phát hiện
     * replay qua khóa chính {@code PK_google_login_credential_uses}) rồi phát hành JWT.
     *
     * @param request chứa ID token Google
     * @return {@link LoginResponse}
     * @throws BusinessException {@code INVALID_GOOGLE_CREDENTIAL}, {@code ACCOUNT_LOCKED_BY_ADMIN}, {@code INVALID_CREDENTIALS},
     *         {@code GOOGLE_EMAIL_NOT_VERIFIED}, {@code GOOGLE_EMAIL_ALREADY_REGISTERED}, {@code GOOGLE_SIGNIN_UNAVAILABLE}
     * @throws GoogleSignupRaceException khi một request song song vừa tạo tài khoản (controller sẽ thử lại)
     */
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
        if (user != null && user.getDeletedAt() == null && "LOCKED".equals(user.getStatus())) {
            // The Google credential is already verified here, so the holder of the linked identity may be told why.
            auditService.recordLoginFailure(user.getUserId());
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED_BY_ADMIN);
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

    /**
     * Đăng nhập Google lần đầu cho subject chưa biết; mọi bước chạy trong transaction của người gọi. Yêu cầu email đã
     * được Google xác minh và hợp lệ; nếu email đã có tài khoản thì không gộp (chủ sở hữu phải đăng nhập bằng mật khẩu rồi
     * tự liên kết Google từ hồ sơ). Tiêu thụ token, tạo Owner ({@code AuthService.createGoogleOwner}), lưu danh tính, phát
     * hành JWT. Nếu thua cuộc đua với request song song (vi phạm {@code UQ_users_email} hoặc
     * {@code UQ_external_auth_identities_provider_subject}) thì ném {@link GoogleSignupRaceException}.
     *
     * @param credential credential Google đã xác minh
     * @return {@link LoginResponse}
     */
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

    /**
     * Ghi dấu một ID token đã dùng (sau khi dọn các dấu hết hạn). Trùng khóa chính nghĩa là token bị dùng lại.
     *
     * @param credential               credential đã xác minh
     * @param user                     người dùng liên quan (chỉ dùng cho audit), có thể {@code null}
     * @param auditReplayAsLoginFailure {@code true} để ghi audit đăng nhập thất bại khi phát hiện replay
     * @throws BusinessException {@code INVALID_GOOGLE_CREDENTIAL} khi token đã được dùng
     */
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
     * Đặt mật khẩu đầu tiên cho tài khoản Google-only ({@code POST /api/v1/auth/password/setup}). Cần ID token Google mới có
     * subject đã liên kết với tài khoản đang đăng nhập, nên chỉ có phiên là chưa đủ. Token được tiêu thụ trong cùng
     * transaction với việc đổi mật khẩu; nếu bước mật khẩu lỗi (chính sách, đã có mật khẩu) thì rollback và token vẫn dùng
     * lại được.
     *
     * @param authenticatedUserId id nội bộ của người dùng đang đăng nhập
     * @param request             mật khẩu mới và credential Google
     * @return {@link PasswordSetupResponse}
     * @throws BusinessException {@code GOOGLE_IDENTITY_MISMATCH}, {@code INVALID_GOOGLE_CREDENTIAL}, {@code PASSWORD_ALREADY_SET},
     *         {@code PASSWORD_POLICY}
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

    /**
     * Liên kết subject Google đã xác minh với tài khoản đang đăng nhập ({@code POST /api/v1/auth/google/link}); không bao giờ
     * liên kết theo email. Tài khoản Google-only chưa có mật khẩu bị từ chối để không vượt qua yêu cầu xác thực lại. Kiểm
     * tra subject chưa được liên kết, ghi dấu token, lưu {@code ExternalAuthIdentity} (ràng buộc duy nhất là chốt chặn
     * cuối khi liên kết song song) và ghi audit {@code AUTH_GOOGLE_IDENTITY_LINKED}.
     *
     * @param request             chứa ID token Google
     * @param authenticatedUserId id nội bộ của người dùng
     * @return {@link GoogleIdentityLinkResponse}
     * @throws BusinessException {@code UNAUTHENTICATED}, {@code PASSWORD_NOT_SET}, {@code GOOGLE_IDENTITY_ALREADY_LINKED},
     *         {@code INVALID_GOOGLE_CREDENTIAL}
     */
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

    /**
     * Kiểm tra chuỗi nguyên nhân của lỗi toàn vẹn dữ liệu có vi phạm ràng buộc tên {@code expectedName} không.
     *
     * @param exception    lỗi toàn vẹn dữ liệu
     * @param expectedName tên ràng buộc cần so khớp (không phân biệt hoa thường)
     * @return {@code true} nếu khớp
     */
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
