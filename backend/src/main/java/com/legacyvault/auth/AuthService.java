
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
 * Dịch vụ xác thực bằng mật khẩu: đăng ký, đăng nhập, phát hành JWT, đặt mật khẩu lần đầu và hồ sơ cá nhân.
 * Được {@link AuthController} (các endpoint {@code /api/v1/auth/register|login|me}) và {@link GoogleAuthService} gọi.
 * Dùng các bảng {@code users}, {@code roles}, {@code user_roles}; ghi audit qua {@code AuditService}
 * ({@code AUTH_REGISTERED}, {@code AUTH_LOGIN_SUCCEEDED}, {@code AUTH_PASSWORD_SET}, {@code AUTH_PROFILE_UPDATED}).
 * Giới hạn thử sai do {@link LoginAttemptLimiter} đảm nhiệm.
 */
@Service
public class AuthService {

    /**
     * Role mặc định gán cho mọi tài khoản tự đăng ký.
     */
    private static final String DEFAULT_ROLE = "ROLE_VAULT_OWNER";

    /**
     * Truy cập bảng {@code users}.
     */
    private final UserRepository userRepository;
    /**
     * Tra cứu role theo mã.
     */
    private final RoleRepository roleRepository;
    /**
     * Quan hệ người dùng - role.
     */
    private final UserRoleRepository userRoleRepository;
    /**
     * Băm/so khớp mật khẩu (BCrypt).
     */
    private final PasswordEncoder passwordEncoder;
    /**
     * Cấp access token.
     */
    private final JwtService jwtService;
    /**
     * Ghi nhật ký kiểm toán.
     */
    private final AuditService auditService;
    /**
     * Xác thực lại mật khẩu hiện tại khi đổi thông tin nhạy cảm.
     */
    private final PasswordReauthService passwordReauthService;
    /**
     * Thu hồi mã xác minh email khi người dùng đổi email.
     */
    private final EmailVerificationService emailVerificationService;
    /**
     * Bộ giới hạn số lần đăng nhập sai theo email và IP.
     */
    private final LoginAttemptLimiter loginAttemptLimiter;
    /** Hash verified when the email is unknown so the response time matches a real wrong password. */
    private volatile String dummyPasswordHash;

    /**
     * Khởi tạo dịch vụ với các phụ thuộc được Spring tiêm vào.
     */
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
     * Đăng ký tài khoản Vault Owner mới ({@code POST /api/v1/auth/register}).
     * Các bước: chuẩn hóa email, kiểm tra trùng, lấy role {@code ROLE_VAULT_OWNER}, tạo {@code User} (mật khẩu BCrypt,
     * trạng thái {@code ACTIVE}), gán role, ghi audit {@code AUTH_REGISTERED}.
     *
     * @param request dữ liệu đăng ký đã validate
     * @return thông tin công khai của tài khoản mới
     * @throws BusinessException {@code EMAIL_ALREADY_EXISTS} nếu email đã tồn tại
     * @throws IllegalStateException nếu thiếu role mặc định trong DB
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
     * Tạo tài khoản Owner cho lần đăng nhập Google đầu tiên (gọi từ {@link GoogleAuthService}, đã xác minh credential
     * và email chưa đăng ký). Tài khoản không có mật khẩu dùng được: hash là chuỗi ngẫu nhiên không ai biết và
     * đăng nhập bằng mật khẩu bị tắt cho đến khi người dùng gọi {@link #setupPassword}. Email được đánh dấu đã xác
     * minh. Ghi audit {@code AUTH_REGISTERED} (provider GOOGLE).
     *
     * @param normalizedEmail email đã chuẩn hóa
     * @param displayName     tên hiển thị từ Google (nếu rỗng dùng phần trước dấu @, cắt tối đa 150 ký tự)
     * @return người dùng đã lưu
     */
    User createGoogleOwner(String normalizedEmail, String displayName) {
        Role ownerRole = roleRepository.findByRoleCode(DEFAULT_ROLE)
                .orElseThrow(() -> new IllegalStateException("Required role not found: " + DEFAULT_ROLE));

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
     * Cho tài khoản Google-only đặt mật khẩu đầu tiên ({@code POST /api/v1/auth/password/setup}, gọi từ
     * {@code GoogleAuthService.setupPassword} sau khi chứng minh quyền với tài khoản Google). Khóa dòng user
     * ({@code findActiveAccountForUpdate}), kiểm tra chưa bật mật khẩu và đúng chính sách, lưu hash, bật đăng nhập mật
     * khẩu và ghi audit {@code AUTH_PASSWORD_SET}. Không tăng auth-version để phiên hiện tại không bị đăng xuất.
     *
     * @param userId   id nội bộ của người dùng
     * @param password mật khẩu mới
     * @return {@link PasswordSetupResponse} với {@code passwordLoginEnabled = true}
     * @throws BusinessException {@code UNAUTHENTICATED}, {@code PASSWORD_ALREADY_SET}, {@code PASSWORD_POLICY}
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
        // The current session stays valid (no auth-version bump): the user is mid-action and must not be logged out.
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

    /**
     * Đăng nhập không biết IP nguồn (chỉ tương thích); ủy quyền cho {@link #login(LoginRequest, String)}.
     * {@code @Transactional} được lặp lại vì self-invocation bỏ qua proxy của phương thức hai tham số.
     *
     * @param request thông tin đăng nhập
     * @return phản hồi đăng nhập
     */
    @Transactional
    public LoginResponse login(LoginRequest request) {
        return login(request, null);
    }

    /**
     * Đăng nhập bằng email + mật khẩu ({@code POST /api/v1/auth/login}).
     * Các bước: chuẩn hóa email; {@code loginAttemptLimiter.reserveAttempt} (đếm nguyên tử trước mọi việc nặng); tìm user;
     * luôn chạy một lần BCrypt (kể cả email không tồn tại, dùng hash giả) để chống dò email qua thời gian; chỉ khi
     * đúng mật khẩu mới tiết lộ tài khoản bị khóa; kiểm tra trạng thái {@code ACTIVE}, chưa xóa, đã bật đăng nhập mật khẩu;
     * thành công thì phát hành token và xóa bộ đếm thất bại.
     *
     * @param request  thông tin đăng nhập
     * @param clientIp địa chỉ IP nguồn (có thể {@code null})
     * @return {@link LoginResponse}
     * @throws BusinessException {@code INVALID_CREDENTIALS}, {@code ACCOUNT_LOCKED_BY_ADMIN} và lỗi giới hạn thử sai
     */
    @Transactional
    public LoginResponse login(LoginRequest request, String clientIp) {
        String normalizedEmail = EmailNormalizer.normalize(request.email());

        // Atomic check + count before any password work, so parallel requests cannot all slip under the limit.
        loginAttemptLimiter.reserveAttempt(normalizedEmail, clientIp);

        User user = userRepository.findByEmail(normalizedEmail).orElse(null);

        // Always run one BCrypt verification, even for an unknown email, so timing does not reveal
        // which emails exist.
        String hashToCheck = user != null ? user.getPasswordHash() : dummyPasswordHash();
        boolean passwordMatches = passwordEncoder.matches(request.password(), hashToCheck);

        // A locked account is only disclosed to someone who proved knowledge of its password, so a wrong password
        // or an unknown email still gets the same generic failure and locked emails cannot be enumerated.
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
        // A successful login proves the password, so the earlier failures of this email no longer count.
        loginAttemptLimiter.clearFailures(normalizedEmail);
        return response;
    }

    /**
     * Trả về hash BCrypt giả (khởi tạo lười, cache) để so khớp khi email không tồn tại.
     */
    private String dummyPasswordHash() {
        String hash = dummyPasswordHash;
        if (hash == null) {
            hash = passwordEncoder.encode("legacyvault-dummy-password");
            dummyPasswordHash = hash;
        }
        return hash;
    }

    /**
     * Phát hành JWT và {@link LoginResponse} cho người dùng đang hoạt động; dùng chung cho đăng nhập mật khẩu và
     * Google. Lấy role từ DB; riêng tài khoản chỉ có {@code ROLE_BENEFICIARY} (dữ liệu cũ) sẽ được tự cấp thêm
     * {@code ROLE_VAULT_OWNER} theo chính sách tài khoản cá nhân (khóa dòng user, kiểm tra lại authVersion, ghi audit
     * {@code AUTH_PROFILE_UPDATED}). Cuối cùng ghi audit {@code AUTH_LOGIN_SUCCEEDED}.
     *
     * @param user người dùng đã xác thực
     * @return phản hồi đăng nhập kèm token
     * @throws BusinessException {@code INVALID_CREDENTIALS} nếu tài khoản không còn hoạt động
     */
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

        // Personal account policy (29/10/2026): repair legacy counter-created / Beneficiary-only
        // accounts individually at authenticated login, never through a bulk migration or invitation.
        // A closed allowlist excludes internal and unknown roles, including mixed internal accounts.
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
     * Lấy hồ sơ của người dùng hiện tại ({@code GET /api/v1/auth/me}).
     *
     * @param authentication đối tượng xác thực
     * @return hồ sơ công khai
     * @throws BusinessException {@code UNAUTHENTICATED} nếu không hợp lệ
     */
    @Transactional(readOnly = true)
    public ProfileResponse getCurrentUser(
            Authentication authentication
    ) {
        User user = requireCurrentUser(authentication, false);
        return toProfileResponse(user);
    }

    /**
     * Cập nhật hồ sơ ({@code PATCH /api/v1/auth/me}). Khóa dòng user; đổi email hoặc mật khẩu là thay đổi nhạy cảm nên
     * bắt buộc tài khoản có mật khẩu và xác thực lại bằng {@code currentPassword} ({@code PasswordReauthService}).
     * Đổi email: kiểm tra trùng, xóa {@code emailVerifiedAt}, thu hồi mã xác minh cũ. Đổi mật khẩu: băm lại và tăng
     * auth-version (vô hiệu token cũ). Bắt lỗi vi phạm ràng buộc {@code UQ_users_email} khi đua. Ghi audit
     * {@code AUTH_PROFILE_UPDATED} kèm danh sách trường đã đổi.
     *
     * @param authentication đối tượng xác thực
     * @param request        các trường cần đổi
     * @return hồ sơ sau cập nhật
     * @throws BusinessException {@code PASSWORD_POLICY}, {@code PASSWORD_NOT_SET}, {@code MALFORMED_REQUEST},
     *         {@code EMAIL_ALREADY_EXISTS}, {@code UNAUTHENTICATED}
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
            // A changed address must not retain a prior proof; PS-116 credentials are also bound to the old address.
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

    /**
     * Kiểm tra chuỗi nguyên nhân có phải vi phạm ràng buộc duy nhất {@code UQ_users_email} không.
     *
     * @param exception ngoại lệ toàn vẹn dữ liệu
     * @return {@code true} nếu do trùng email
     */
    private boolean violatesEmailUniqueConstraint(DataIntegrityViolationException exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation
                    && "UQ_users_email".equalsIgnoreCase(violation.getConstraintName())) {
                return true;
            }
        }
        return false;
    }

    /**
     * Ghi một sự kiện audit của người dùng lên chính tài khoản mình (đối tượng {@code USER}).
     *
     * @param action  hành động audit
     * @param userId  id người dùng
     * @param context ngữ cảnh bổ sung
     */
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

    /**
     * Lấy người dùng hiện tại từ {@link Authentication}, yêu cầu còn {@code ACTIVE} và chưa xóa.
     *
     * @param authentication đối tượng xác thực
     * @param lock           {@code true} để khóa dòng ({@code findActiveAccountForUpdate}) khi sắp ghi
     * @return thực thể người dùng
     * @throws BusinessException {@code UNAUTHENTICATED}
     */
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

    /**
     * Chuyển {@link User} thành {@link ProfileResponse} (role bỏ tiền tố, loại trùng, sắp xếp).
     */
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
     * Chuẩn hóa role chỉ dành cho dữ liệu trả về từ API (bỏ tiền tố {@code ROLE_}).
     * Không dùng kết quả này để tạo JWT hoặc GrantedAuthority.
     *
     * @param roleCode mã role đầy đủ
     * @return mã role đã bỏ tiền tố
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
