
package com.legacyvault.auth;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
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

    public AuthService(
            UserRepository userRepository,
            RoleRepository roleRepository,
            UserRoleRepository userRoleRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuditService auditService,
            PasswordReauthService passwordReauthService
    ) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.userRoleRepository = userRoleRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.auditService = auditService;
        this.passwordReauthService = passwordReauthService;
    }

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

    @Transactional
    public LoginResponse login(LoginRequest request) {
        String normalizedEmail = EmailNormalizer.normalize(request.email());

        User user = userRepository.findByEmail(normalizedEmail).orElse(null);

        if (user == null
                || !"ACTIVE".equals(user.getStatus())
                || user.getDeletedAt() != null
                || !user.isPasswordLoginAllowed()
                || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {

            auditService.recordLoginFailure(user != null ? user.getUserId() : null);
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        return issueLoginResponseForActiveUser(user);
    }

    /** Shared JWT/session issuance for password and already-linked provider logins. */
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

    @Transactional(readOnly = true)
    public ProfileResponse getCurrentUser(
            Authentication authentication
    ) {
        User user = requireCurrentUser(authentication, false);
        return toProfileResponse(user);
    }

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
            // No email verification flow exists in this codebase. A changed address must not retain a prior proof.
            user.setEmailVerifiedAt(null);
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
                apiRoles
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
