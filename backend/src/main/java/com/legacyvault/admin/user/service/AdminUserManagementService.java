package com.legacyvault.admin.user.service;

import com.legacyvault.admin.user.dto.AdminCreateUserRequest;
import com.legacyvault.admin.user.dto.AdminUpdateUserRoleRequest;
import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.EmailNormalizer;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.vault.repository.VaultRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Admin-only account provisioning and role assignment. Only the Staff, Legal and Vault Owner roles can be
 * granted here; Admin accounts are never created or altered through this API, and an Admin cannot change
 * their own role. Roles are read from the database on every request, so a change applies immediately.
 */
@Service
public class AdminUserManagementService {
    static final String OWNER = "ROLE_VAULT_OWNER";
    static final Set<String> ASSIGNABLE = Set.of("ROLE_STAFF_EXECUTOR", "ROLE_LEGAL_VERIFIER", OWNER);

    private final UserRepository users;
    private final RoleRepository roles;
    private final UserRoleRepository userRoles;
    private final VaultRepository vaults;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;
    private final AdminUserQueryService query;

    public AdminUserManagementService(UserRepository users, RoleRepository roles, UserRoleRepository userRoles,
                                      VaultRepository vaults, PasswordEncoder passwordEncoder, AuditService audit,
                                      AdminUserQueryService query) {
        this.users = users;
        this.roles = roles;
        this.userRoles = userRoles;
        this.vaults = vaults;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
        this.query = query;
    }

    @Transactional
    public AdminUserResponse createUser(Long adminUserId, AdminCreateUserRequest request) {
        String roleCode = assignable(request.role());
        String email = EmailNormalizer.normalize(request.email());
        if (users.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        Role role = requireRole(roleCode);

        User user = new User();
        user.setFullName(request.fullName().trim());
        user.setEmail(email);
        user.setPhoneNumber(request.phone() == null || request.phone().isBlank() ? null : request.phone().trim());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setStatus("ACTIVE");
        User saved;
        try {
            saved = users.saveAndFlush(user);
        } catch (DataIntegrityViolationException duplicate) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        UserRole link = new UserRole(saved, role);
        link.setAssignedByUserId(adminUserId);
        userRoles.save(link);

        record(AuditAction.ADMIN_USER_CREATED, adminUserId, saved.getUserId(), null,
                "{\"roles\":" + json(List.of(roleCode)) + "}", Map.of("result", "SUCCESS", "role", roleCode));
        return query.getUser(saved.getPublicId());
    }

    @Transactional
    public AdminUserResponse changeRole(Long adminUserId, UUID publicId, AdminUpdateUserRoleRequest request) {
        String newRole = assignable(request.role());
        User found = users.findByPublicId(publicId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (found.getUserId().equals(adminUserId)) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_PROTECTED);
        }
        // The row lock serialises with vault creation, which locks the same row before it checks ownership.
        User target = users.findActiveAccountForUpdate(found.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        List<UserRole> links = userRoles.findByUserIdWithRole(target.getUserId());
        if (links.stream().anyMatch(link -> "ROLE_ADMIN".equals(link.getRole().getRoleCode()))) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_PROTECTED);
        }
        List<UserRole> managed = links.stream()
                .filter(link -> ASSIGNABLE.contains(link.getRole().getRoleCode())).toList();
        List<String> before = managed.stream().map(link -> link.getRole().getRoleCode()).sorted().toList();
        if (before.equals(List.of(newRole))) {
            return query.getUser(publicId);
        }
        if (before.contains(OWNER) && !OWNER.equals(newRole) && vaults.existsByOwnerUserId(target.getUserId())) {
            throw new BusinessException(ErrorCode.ADMIN_OWNER_HAS_VAULT);
        }

        Role role = requireRole(newRole);
        userRoles.deleteAll(managed);
        userRoles.flush();
        UserRole link = new UserRole(target, role);
        link.setAssignedByUserId(adminUserId);
        userRoles.saveAndFlush(link);

        record(AuditAction.ADMIN_USER_ROLE_CHANGED, adminUserId, target.getUserId(),
                "{\"roles\":" + json(before) + "}", "{\"roles\":" + json(List.of(newRole)) + "}",
                Map.of("result", "SUCCESS", "from", before, "to", newRole));
        return query.getUser(publicId);
    }

    private static String assignable(String role) {
        String code = role == null ? "" : role.trim().toUpperCase(Locale.ROOT);
        if (!code.startsWith("ROLE_")) {
            code = "ROLE_" + code;
        }
        if (!ASSIGNABLE.contains(code)) {
            throw new BusinessException(ErrorCode.ADMIN_ROLE_NOT_ASSIGNABLE);
        }
        return code;
    }

    private Role requireRole(String code) {
        return roles.findByRoleCode(code)
                .orElseThrow(() -> new IllegalStateException("Required role not found: " + code));
    }

    private static String json(List<String> values) {
        return values.stream().map(value -> "\"" + value + "\"").collect(Collectors.joining(",", "[", "]"));
    }

    private void record(AuditAction action, Long adminUserId, Long targetUserId, String before, String after,
                        Map<String, Object> context) {
        audit.record(new AuditEvent(action, AuditActorType.USER, adminUserId, null, "USER", targetUserId,
                before, after, null, context, action.name(), null));
    }
}
