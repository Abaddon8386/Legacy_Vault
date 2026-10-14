package com.legacyvault.auth.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.EmailNormalizer;
import com.legacyvault.auth.JwtService;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.auth.dto.RegisterRequest;
import com.legacyvault.auth.dto.RegisterResponse;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.legacyvault.user.repository.UserRoleRepository;

import java.util.List;
import java.util.Map;

@Service
public class AuthService {
    private static final String DEFAULT_ROLE = "VAULT_OWNER";
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditService auditService;

    public AuthService(
            UserRepository userRepository,
            RoleRepository roleRepository,
            UserRoleRepository userRoleRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuditService auditService
    ) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.userRoleRepository = userRoleRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.auditService = auditService;
    }

    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        String normalizedEmail = EmailNormalizer.normalize(request.email());

        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }

        Role ownerRole = roleRepository.findByRoleCode(DEFAULT_ROLE).orElseThrow(() -> new IllegalStateException("Required role not found: " + DEFAULT_ROLE));
        User user = new User();
        user.setFullName(request.fullName().trim());
        user.setEmail(normalizedEmail);
        user.setPhoneNumber(request.phone() == null || request.phone().isBlank() ? null : request.phone().trim());
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
                "AUTH_REGISTER",
                null
        ));

        return new RegisterResponse(
                savedUser.getPublicId(),
                savedUser.getFullName(),
                savedUser.getEmail(),
                List.of(DEFAULT_ROLE),
                savedUser.getStatus(),
                savedUser.getCreatedAt().toInstant(java.time.ZoneOffset.UTC)
        );
    }


    @Transactional
    public LoginResponse login(LoginRequest request) {
        String normalizedEmail = EmailNormalizer.normalize(request.email());

        User user = userRepository.findByEmail(normalizedEmail).orElse(null);

        if (user == null
                || !"ACTIVE".equals(user.getStatus())
                || user.getDeletedAt() != null
                || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {

            auditService.recordLoginFailure(user != null ? user.getUserId() : null);

            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        List<String> roles = userRoleRepository
                .findByUser_UserId(user.getUserId())
                .stream()
                .map(userRole -> userRole.getRole().getRoleCode())
                .distinct()
                .sorted()
                .toList();

        String accessToken = jwtService.generateAccessToken(user.getPublicId(), user.getEmail(), roles);

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
                        roles
                )
        );
    }

    @Transactional(readOnly = true)
    public LoginResponse.AuthUserResponse getCurrentUser(
            org.springframework.security.core.Authentication authentication) {

        if (authentication == null
                || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof CustomUserPrincipal principal)) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED);
        }

        User user = userRepository.findByPublicId(principal.publicId())
                .filter(foundUser -> "ACTIVE".equals(foundUser.getStatus()))
                .filter(foundUser -> foundUser.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));

        List<String> roles = userRoleRepository
                .findByUserIdWithRole(user.getUserId())
                .stream()
                .map(UserRole::getRole)
                .filter(java.util.Objects::nonNull)
                .map(Role::getRoleCode)
                .filter(roleCode -> roleCode != null && !roleCode.isBlank())
                .distinct()
                .sorted()
                .toList();

        return new LoginResponse.AuthUserResponse(
                user.getPublicId(),
                user.getFullName(),
                user.getEmail(),
                roles
        );
    }
}
