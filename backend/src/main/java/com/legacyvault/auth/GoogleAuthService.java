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
 * Đăng nhập các Google subject đã liên kết, tạo tài khoản Owner cho người dùng Google hoàn toàn mới có email chưa
 * đăng ký, và hỗ trợ tự liên kết khi đã xác thực. Không bao giờ liên kết tài khoản hiện có theo email.
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

    /**
     * Đăng nhập bằng Google ID token.
     * Luồng: xác thực token; nếu subject chưa liên kết thì đăng ký mới ({@link #signUp}); nếu đã liên kết thì kiểm tra trạng thái tài khoản,
     * đánh dấu token đã dùng (chống replay qua khóa chính hash) rồi cấp JWT. Token sai được ghi nhận như một lần đăng nhập thất bại.
     * @throws BusinessException INVALID_GOOGLE_CREDENTIAL, ACCOUNT_LOCKED_BY_ADMIN, INVALID_CREDENTIALS, GOOGLE_EMAIL_ALREADY_REGISTERED, ...
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
            // Credential Google đã được xác minh ở đây, nên người giữ danh tính đã liên kết có thể được cho biết lý do.
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

    /** Đăng nhập Google lần đầu: subject chưa biết. Mọi thứ chạy trong một transaction của caller. */
    // Không bao giờ gộp tài khoản theo email: nếu email đã có tài khoản mật khẩu thì từ chối (chống chiếm tài khoản qua email trùng).
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
            // Một request song song cho chính danh tính Google này có thể đã commit tài khoản giữa lúc tra cứu danh tính
            // và bước kiểm tra này (SQL Server chặn việc đọc email đến khi commit). Đọc lại danh tính: nếu
            // giờ đã tồn tại thì đây là cuộc đua đó, nên caller thử lại và đăng nhập đúng người dùng Google ấy.
            if (identities.findByProviderCodeAndSubject(GOOGLE_PROVIDER, credential.subject()).isPresent()) {
                throw new GoogleSignupRaceException();
            }
            // Không bao giờ gộp theo email: chủ tài khoản chứng minh quyền kiểm soát bằng mật khẩu, rồi liên kết Google từ hồ sơ.
            throw new BusinessException(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED);
        }

        consumeCredential(credential, null, true);

        User created;
        try {
            created = authService.createGoogleOwner(email, credential.name());
            identities.saveAndFlush(new ExternalAuthIdentity(GOOGLE_PROVIDER, credential.subject(), created));
        } catch (DataIntegrityViolationException exception) {
            // Một request song song với token khác đã tạo cùng email hoặc subject trước; unique index quyết định.
            // Transaction này giờ đã rollback, nên caller thử lại một lần: nếu người thắng là cùng người dùng Google
            // thì lần thử lại đăng nhập cho họ, còn nếu email thật sự thuộc người khác thì nhận lỗi 409 thật.
            if (violatesConstraint(exception, "UQ_users_email")
                    || violatesConstraint(exception, "UQ_external_auth_identities_provider_subject")) {
                throw new GoogleSignupRaceException();
            }
            throw exception;
        }
        return authService.issueLoginResponseForActiveUser(created);
    }

    /**
     * Đánh dấu Google ID token đã được dùng bằng cách chèn hash vào bảng {@code google_login_credential_uses} (khóa chính = hash).
     * Chèn trùng khóa nghĩa là token bị dùng lại (replay) và bị từ chối; các bản ghi hết hạn được dọn trước.
     * @param auditReplayAsLoginFailure true thì ghi audit đăng nhập thất bại khi phát hiện replay
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
     * Mật khẩu đầu tiên cho tài khoản chỉ dùng Google. Yêu cầu Google ID token mới có subject đã liên kết với
     * tài khoản đang đăng nhập, nên chỉ có phiên là chưa đủ. Token được tiêu thụ trong cùng transaction với
     * thay đổi mật khẩu; nếu bước mật khẩu lỗi (policy, đã có mật khẩu) mọi thứ rollback và token vẫn dùng được.
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

    /** Chỉ liên kết Google subject đã xác minh vào tài khoản đã xác thực; không bao giờ liên kết theo email. */
    @Transactional
    public GoogleIdentityLinkResponse linkIdentity(GoogleLoginRequest request, Long authenticatedUserId) {
        User user = users.findById(authenticatedUserId)
                .filter(found -> "ACTIVE".equals(found.getStatus()) && found.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
        // Tài khoản chỉ dùng Google (chưa có mật khẩu) không được thêm danh tính Google khác: điều đó sẽ cho phép một
        // phiên trần bỏ qua bước xác thực lại mà việc đặt mật khẩu đầu tiên yêu cầu. Hãy đặt mật khẩu trước.
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
            // Ràng buộc unique của database là chốt chặn cuối chống các request liên kết đồng thời.
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

    // Tìm trong chuỗi cause xem lỗi có phải vi phạm đúng constraint đặt tên hay không (để phân biệt đua dữ liệu với lỗi khác).
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
