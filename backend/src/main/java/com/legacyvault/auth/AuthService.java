
package com.legacyvault.auth;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.auth.dto.PasswordSetupResponse;
import com.legacyvault.auth.dto.RegisterRequest;
import com.legacyvault.auth.dto.RegisterResponse;
import com.legacyvault.auth.dto.ProfileResponse;
import com.legacyvault.auth.dto.ProfileUpdateRequest;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.auth.policy.PasswordPolicy;

import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.auth.emailverification.EmailVerificationService;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;

import org.hibernate.exception.ConstraintViolationException;

import java.time.ZoneOffset;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;


/**
 * Nghiệp vụ xác thực cốt lõi: đăng ký, đăng nhập mật khẩu, cấp JWT, thiết lập mật khẩu lần đầu và đọc/cập nhật hồ sơ.
 * Được {@link AuthController} và {@link GoogleAuthService} sử dụng; các sự kiện quan trọng được ghi qua {@code AuditService}.
 */
@Service
public class AuthService {

    private static final String DEFAULT_ROLE = "ROLE_VAULT_OWNER";

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditService auditService;
    private final PasswordReauthService passwordReauthService;
    private final EmailVerificationService emailVerificationService;
    private final LoginAttemptLimiter loginAttemptLimiter;
    /** Hash được kiểm tra khi email không tồn tại, để thời gian phản hồi giống trường hợp sai mật khẩu thật. */
    private volatile String dummyPasswordHash;

    public AuthService(
            UserRepository userRepository,
            RoleRepository roleRepository,
            UserRoleRepository userRoleRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuditService auditService,
            PasswordReauthService passwordReauthService,
            EmailVerificationService emailVerificationService,
            LoginAttemptLimiter loginAttemptLimiter
    ) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.userRoleRepository = userRoleRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.auditService = auditService;
        this.passwordReauthService = passwordReauthService;
        this.emailVerificationService = emailVerificationService;
        this.loginAttemptLimiter = loginAttemptLimiter;
    }

    /**
     * Đăng ký tài khoản mới với role mặc định {@code ROLE_VAULT_OWNER}.
     * Chuẩn hóa email, từ chối nếu đã tồn tại, băm mật khẩu bằng {@link PasswordEncoder}, lưu user + user_role và ghi audit AUTH_REGISTERED.
     * @throws BusinessException EMAIL_ALREADY_EXISTS nếu email đã được dùng
     * @return thông tin công khai của tài khoản (role trả về đã bỏ tiền tố {@code ROLE_})
     */
    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        String normalizedEmail = EmailNormalizer.normalize(request.email());

        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }

        Role ownerRole = roleRepository.findByRoleCode(DEFAULT_ROLE)
                .orElseThrow(() ->
                        new IllegalStateException("Required role not found: " + DEFAULT_ROLE));

        User user = new User();
        user.setFullName(request.fullName().trim());
        user.setEmail(normalizedEmail);
        user.setPhoneNumber(
                request.phone() == null || request.phone().isBlank()
                        ? null
                        : request.phone().trim()
        );
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setStatus("ACTIVE");

        User savedUser = userRepository.saveAndFlush(user);

        UserRole userRole = new UserRole(savedUser, ownerRole);
        userRoleRepository.save(userRole);

        auditService.record(new AuditEvent(
                AuditAction.AUTH_REGISTERED,
                AuditActorType.USER,
                savedUser.getUserId(),
                null,
                "USER",
                savedUser.getUserId(),
                null,
                "{\"status\":\"ACTIVE\"}",
                null,
                Map.of("result", "SUCCESS"),
                "AUTH_REGISTERED",
                null
        ));

        return new RegisterResponse(
                savedUser.getPublicId(),
                savedUser.getFullName(),
                savedUser.getEmail(),
                List.of(toApiRole(DEFAULT_ROLE)),
                savedUser.getStatus(),
                savedUser.getCreatedAt().toInstant(ZoneOffset.UTC)
        );
    }

    /**
     * Tạo tài khoản Owner cho lần đăng nhập Google đầu tiên. Caller đã xác minh credential Google
     * và email đã được Google xác minh, chưa đăng ký. Tài khoản chưa có mật khẩu dùng được:
     * hash lưu là chuỗi ngẫu nhiên không ai biết, và đăng nhập bằng mật khẩu vẫn tắt cho đến khi
     * người dùng đặt mật khẩu qua {@link #setupPassword}.
     */
    User createGoogleOwner(String normalizedEmail, String displayName) {
        Role ownerRole = roleRepository.findByRoleCode(DEFAULT_ROLE)
                .orElseThrow(() -> new IllegalStateException("Required role not found: " + DEFAULT_ROLE));

        // Hash lưu là chuỗi ngẫu nhiên 32 byte không ai biết, nên không thể đăng nhập mật khẩu cho tới khi gọi setupPassword.
        byte[] secret = new byte[32];
        new java.security.SecureRandom().nextBytes(secret);

        User user = new User();
        String name = displayName == null ? "" : displayName.trim();
        if (name.isEmpty()) {
            name = normalizedEmail.substring(0, normalizedEmail.indexOf('@'));
        }
        user.setFullName(name.length() > 150 ? name.substring(0, 150) : name);
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(java.util.Base64.getEncoder().encodeToString(secret)));
        user.setPasswordLoginEnabled(false);
        user.setStatus("ACTIVE");
        user.setEmailVerifiedAt(LocalDateTime.now(ZoneOffset.UTC));

        User saved = userRepository.saveAndFlush(user);
        userRoleRepository.save(new UserRole(saved, ownerRole));

        auditService.record(new AuditEvent(
                AuditAction.AUTH_REGISTERED,
                AuditActorType.USER,
                saved.getUserId(),
                null,
                "USER",
                saved.getUserId(),
                null,
                "{\"status\":\"ACTIVE\"}",
                null,
                Map.of("result", "SUCCESS", "provider", "GOOGLE"),
                "AUTH_REGISTERED",
                null
        ));
        return saved;
    }

    /**
     * Cho phép tài khoản chỉ dùng Google chọn mật khẩu đầu tiên. Không được phép khi đăng nhập bằng mật khẩu đã bật. Caller
     * ({@link GoogleAuthService#setupPassword}) phải đã chứng minh quyền kiểm soát tài khoản Google đã liên kết.
     */
    @Transactional
    public PasswordSetupResponse setupPassword(Long userId, String password) {
        User user = userRepository.findActiveAccountForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
        if (user.isPasswordLoginAllowed()) {
            throw new BusinessException(ErrorCode.PASSWORD_ALREADY_SET);
        }
        if (!new PasswordPolicy().isValid(password, null)) {
            throw new BusinessException(ErrorCode.PASSWORD_POLICY);
        }
        // Phiên hiện tại vẫn hợp lệ (không tăng auth-version): người dùng đang giữa thao tác và không được bị đăng xuất.
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setPasswordLoginEnabled(true);
        userRepository.flush();

        auditService.record(new AuditEvent(
                AuditAction.AUTH_PASSWORD_SET,
                AuditActorType.USER,
                userId,
                null,
                "USER",
                userId,
                null,
                null,
                null,
                Map.of("result", "SUCCESS"),
                "AUTH_PASSWORD_SET",
                null
        ));
        return new PasswordSetupResponse(true);
    }

    // Cũng cần transactional ở đây: lời gọi bên dưới là self-invocation, nên annotation trên phương thức hai tham số
    // bị bỏ qua khi vào phương thức này (lazy roles và lần đọc có khóa sẽ chạy mà không có session).
    @Transactional
    public LoginResponse login(LoginRequest request) {
        return login(request, null);
    }

    /**
     * Đăng nhập bằng email/mật khẩu.
     * Luồng: (1) đặt chỗ lượt thử trong limiter, (2) tìm user, (3) luôn chạy một lần BCrypt kể cả khi email không tồn tại (chống dò email qua thời gian phản hồi),
     * (4) tài khoản bị admin khóa chỉ được tiết lộ cho người đã đúng mật khẩu, (5) mọi lỗi còn lại trả INVALID_CREDENTIALS chung, (6) thành công thì xóa bộ đếm sai.
     * @param clientIp IP client để giới hạn theo IP (có thể null)
     * @throws BusinessException INVALID_CREDENTIALS, ACCOUNT_LOCKED_BY_ADMIN, TOO_MANY_ATTEMPTS, RATE_LIMITED
     */
    @Transactional
    public LoginResponse login(LoginRequest request, String clientIp) {
        String normalizedEmail = EmailNormalizer.normalize(request.email());

        // Kiểm tra + đếm nguyên tử trước mọi xử lý mật khẩu, để các request song song không cùng lọt dưới giới hạn.
        loginAttemptLimiter.reserveAttempt(normalizedEmail, clientIp);

        User user = userRepository.findByEmail(normalizedEmail).orElse(null);

        // Luôn chạy một lần BCrypt, kể cả với email không tồn tại, để thời gian phản hồi không lộ
        // email nào tồn tại.
        String hashToCheck = user != null ? user.getPasswordHash() : dummyPasswordHash();
        boolean passwordMatches = passwordEncoder.matches(request.password(), hashToCheck);

        // Tài khoản bị khóa chỉ được tiết lộ cho người đã chứng minh biết mật khẩu, nên sai mật khẩu
        // hoặc email không tồn tại vẫn nhận cùng một lỗi chung và không thể dò email bị khóa.
        if (user != null && passwordMatches && user.isPasswordLoginAllowed() && user.getDeletedAt() == null
                && "LOCKED".equals(user.getStatus())) {
            auditService.recordLoginFailure(user.getUserId());
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED_BY_ADMIN);
        }

        if (user == null
                || !"ACTIVE".equals(user.getStatus())
                || user.getDeletedAt() != null
                || !user.isPasswordLoginAllowed()
                || !passwordMatches) {

            auditService.recordLoginFailure(user != null ? user.getUserId() : null);
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        LoginResponse response = issueLoginResponseForActiveUser(user);
        // Đăng nhập thành công chứng minh mật khẩu, nên các lần sai trước của email này không còn được tính.
        loginAttemptLimiter.clearFailures(normalizedEmail);
        return response;
    }

    // Khởi tạo lười hash giả (volatile; ghi trùng là vô hại) dùng để cân bằng thời gian khi email không tồn tại.
    private String dummyPasswordHash() {
        String hash = dummyPasswordHash;
        if (hash == null) {
            hash = passwordEncoder.encode("legacyvault-dummy-password");
            dummyPasswordHash = hash;
        }
        return hash;
    }

    /** Cấp JWT/phiên dùng chung cho đăng nhập bằng mật khẩu và bằng nhà cung cấp đã liên kết. */
    LoginResponse issueLoginResponseForActiveUser(User user) {
        if (user == null || !"ACTIVE".equals(user.getStatus()) || user.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        List<String> securityRoles = userRoleRepository.findByUser_UserId(user.getUserId())
                .stream()
                .map(UserRole::getRole)
                .filter(Objects::nonNull)
                .map(Role::getRoleCode)
                .filter(roleCode -> roleCode != null && !roleCode.isBlank())
                .distinct()
                .sorted()
                .toList();

        // Chính sách tài khoản cá nhân (29/10/2026): sửa từng tài khoản cũ do quầy tạo / chỉ có Beneficiary
        // khi đăng nhập có xác thực, không bao giờ qua migration hàng loạt hay lời mời.
        // Allowlist đóng loại trừ role nội bộ và không xác định, kể cả tài khoản nội bộ có nhiều role.
        // Nếu tài khoản chỉ có ROLE_BENEFICIARY thì tự bổ sung ROLE_VAULT_OWNER.
        // Khóa dòng user rồi đọc lại role và so authVersion để hai lần đăng nhập song song không thêm role hai lần hoặc dùng dữ liệu cũ.
        if (securityRoles.stream().allMatch("ROLE_BENEFICIARY"::equals)) {
            User locked = userRepository.findActiveAccountForUpdate(user.getUserId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));
            if (locked.getAuthVersion() != user.getAuthVersion()) {
                throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
            }
            List<String> currentRoles = userRoleRepository.findByUserIdWithRole(user.getUserId()).stream()
                    .map(UserRole::getRole).map(Role::getRoleCode).distinct().sorted().toList();
            if (currentRoles.stream().allMatch("ROLE_BENEFICIARY"::equals)) {
                Role ownerRole = roleRepository.findByRoleCode(DEFAULT_ROLE)
                        .orElseThrow(() -> new IllegalStateException("Required role not found: " + DEFAULT_ROLE));
                userRoleRepository.saveAndFlush(new UserRole(locked, ownerRole));
                securityRoles = java.util.stream.Stream.concat(currentRoles.stream(), java.util.stream.Stream.of(DEFAULT_ROLE))
                        .sorted().toList();
                recordProfileAudit(AuditAction.AUTH_PROFILE_UPDATED, user.getUserId(),
                        Map.of("result", "SUCCESS", "changedFields", List.of("personalOwnerRole")));
            } else {
                securityRoles = currentRoles;
            }
        }

        String accessToken = jwtService.generateAccessToken(
                user.getPublicId(),
                user.getEmail(),
                securityRoles, user.getAuthVersion()
        );

        List<String> apiRoles = securityRoles.stream()
                .map(this::toApiRole)
                .toList();

        auditService.record(new AuditEvent(
                AuditAction.AUTH_LOGIN_SUCCEEDED,
                AuditActorType.USER,
                user.getUserId(),
                null,
                "USER",
                user.getUserId(),
                null,
                null,
                null,
                Map.of("result", "SUCCESS"),
                "AUTH_LOGIN",
                null
        ));

        return new LoginResponse(
                accessToken,
                "Bearer",
                jwtService.getExpirationSeconds(),
                new LoginResponse.AuthUserResponse(
                        user.getPublicId(),
                        user.getFullName(),
                        user.getEmail(),
                        apiRoles
                )
        );
    }

    /**
     * Trả về hồ sơ của người dùng đang đăng nhập (chỉ đọc).
     * @throws BusinessException UNAUTHENTICATED nếu tài khoản không còn ACTIVE
     */
    @Transactional(readOnly = true)
    public ProfileResponse getCurrentUser(
            Authentication authentication
    ) {
        User user = requireCurrentUser(authentication, false);
        return toProfileResponse(user);
    }

    /**
     * Cập nhật một phần hồ sơ (họ tên, SĐT, email, mật khẩu) trong một transaction, có khóa dòng user.
     * Đổi email hoặc mật khẩu là thay đổi nhạy cảm: tài khoản phải đang bật đăng nhập mật khẩu và phải nhập lại mật khẩu hiện tại;
     * gửi currentPassword khi không cần thì bị coi là request sai. Đổi email hủy xác minh email cũ; đổi mật khẩu tăng authVersion để vô hiệu hóa token đã cấp.
     * @throws BusinessException PASSWORD_POLICY, PASSWORD_NOT_SET, MALFORMED_REQUEST, EMAIL_ALREADY_EXISTS
     */
    @Transactional
    public ProfileResponse updateCurrentUser(Authentication authentication, ProfileUpdateRequest request) {
        User user = requireCurrentUser(authentication, true);
        List<String> profileFieldsChanged = new ArrayList<>();

        String normalizedEmail = request.getEmail() == null ? null : EmailNormalizer.normalize(request.getEmail());
        boolean emailChanged = normalizedEmail != null && !Objects.equals(normalizedEmail, user.getEmail());
        boolean passwordChanged = request.getPassword() != null;
        boolean sensitiveChange = emailChanged || passwordChanged;

        if (passwordChanged && !new PasswordPolicy().isValid(request.getPassword(), null)) {
            throw new BusinessException(ErrorCode.PASSWORD_POLICY);
        }
        if (sensitiveChange) {
            if (!user.isPasswordLoginAllowed()) {
                throw new BusinessException(ErrorCode.PASSWORD_NOT_SET);
            }
            if (request.getCurrentPassword() == null || request.getCurrentPassword().isBlank()) {
                throw new BusinessException(ErrorCode.MALFORMED_REQUEST);
            }
            passwordReauthService.requirePassword(user.getUserId(), null, request.getCurrentPassword());
        } else if (request.getCurrentPassword() != null) {
            throw new BusinessException(ErrorCode.MALFORMED_REQUEST);
        }

        if (request.getFullName() != null) {
            String fullName = request.getFullName().trim();
            if (!Objects.equals(fullName, user.getFullName())) {
                user.setFullName(fullName);
                profileFieldsChanged.add("fullName");
            }
        }
        if (request.getPhoneNumber() != null) {
            String phone = request.getPhoneNumber().trim();
            String phoneNumber = phone.isEmpty() ? null : phone;
            if (!Objects.equals(phoneNumber, user.getPhoneNumber())) {
                user.setPhoneNumber(phoneNumber);
                profileFieldsChanged.add("phoneNumber");
            }
        }
        if (emailChanged) {
            if (userRepository.existsByEmailAndUserIdNot(normalizedEmail, user.getUserId())) {
                throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
            }
            user.setEmail(normalizedEmail);
            // Địa chỉ đã đổi không được giữ bằng chứng cũ; credential PS-116 cũng gắn với địa chỉ cũ.
            user.setEmailVerifiedAt(null);
            emailVerificationService.revokeForEmailChange(user.getUserId());
            profileFieldsChanged.add("email");
        }
        if (passwordChanged) {
            user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
            user.advanceAuthVersion(LocalDateTime.now(ZoneOffset.UTC));
            profileFieldsChanged.add("password");
        }
        try {
            // Flush sớm để bắt vi phạm unique index UQ_users_email khi hai request đổi cùng email chạy song song, rồi đổi thành lỗi nghiệp vụ.
            userRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            if (emailChanged && violatesEmailUniqueConstraint(exception)) {
                throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
            }
            throw exception;
        }

        if (!profileFieldsChanged.isEmpty()) {
            recordProfileAudit(AuditAction.AUTH_PROFILE_UPDATED, user.getUserId(),
                    Map.of("result", "SUCCESS", "changedFields", List.copyOf(profileFieldsChanged)));
        }
        return toProfileResponse(user);
    }

    // Duyệt chuỗi cause để tìm ConstraintViolationException của UQ_users_email.
    private boolean violatesEmailUniqueConstraint(DataIntegrityViolationException exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation
                    && "UQ_users_email".equalsIgnoreCase(violation.getConstraintName())) {
                return true;
            }
        }
        return false;
    }

    private void recordProfileAudit(AuditAction action, Long userId, Map<String, Object> context) {
        auditService.record(new AuditEvent(
                action,
                AuditActorType.USER,
                userId,
                null,
                "USER",
                userId,
                null,
                null,
                null,
                context,
                "PS-79",
                "LV-AUD-001"
        ));
    }

    // lock=true: khóa ghi dòng user (dùng cho thao tác sửa); lock=false: đọc thường theo publicId và đối chiếu lại userId/trạng thái.
    private User requireCurrentUser(Authentication authentication, boolean lock) {
        if (authentication == null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof CustomUserPrincipal principal)) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED);
        }
        if (lock) {
            return userRepository.findActiveAccountForUpdate(principal.userId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
        }
        return userRepository.findByPublicId(principal.publicId())
                .filter(user -> principal.userId().equals(user.getUserId()))
                .filter(user -> "ACTIVE".equals(user.getStatus()))
                .filter(user -> user.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
    }

    private ProfileResponse toProfileResponse(User user) {

        List<String> apiRoles = userRoleRepository
                .findByUserIdWithRole(user.getUserId())
                .stream()
                .map(UserRole::getRole)
                .filter(Objects::nonNull)
                .map(Role::getRoleCode)
                .filter(roleCode -> roleCode != null && !roleCode.isBlank())
                .map(this::toApiRole)
                .distinct()
                .sorted()
                .toList();

        return new ProfileResponse(
                user.getPublicId(),
                user.getFullName(),
                user.getEmail(),
                user.getPhoneNumber(),
                apiRoles,
                user.isPasswordLoginAllowed()
        );
    }

    /**
     * Chuẩn hóa role chỉ dành cho dữ liệu trả về từ API.
     * Không sử dụng kết quả này để tạo JWT hoặc GrantedAuthority.
     */
    private String toApiRole(String roleCode) {
        if (roleCode == null || roleCode.isBlank()) {
            return roleCode;
        }

        return roleCode.startsWith("ROLE_")
                ? roleCode.substring("ROLE_".length())
                : roleCode;
    }
}
