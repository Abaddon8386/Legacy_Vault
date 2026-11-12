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

    /** Constructor injection các repository, bộ mã hoá mật khẩu, {@link AuditService} và {@link AdminUserQueryService}. */
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

    /**
     * Tạo tài khoản do Admin cấp (API {@code POST /api/v1/admin/users}).
     * <ol>
     *   <li>Kiểm tra role thuộc {@link #ASSIGNABLE}; chuẩn hoá email bằng {@link EmailNormalizer}.</li>
     *   <li>Từ chối nếu email đã tồn tại (kể cả khi bị đua lúc lưu: bắt {@code DataIntegrityViolationException}).</li>
     *   <li>Lưu {@code User} trạng thái ACTIVE với mật khẩu đã băm, rồi gắn {@code UserRole} và ghi nhận Admin cấp.</li>
     *   <li>Ghi audit {@code ADMIN_USER_CREATED}.</li>
     * </ol>
     *
     * @param adminUserId id nội bộ của Admin thực hiện
     * @return tài khoản vừa tạo
     * @throws BusinessException {@code ADMIN_ROLE_NOT_ASSIGNABLE}, {@code EMAIL_ALREADY_EXISTS}
     */
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
        return query.getUser(saved.getPublicId(), null);
    }

    /**
     * Đổi vai trò của một tài khoản (API {@code PUT /api/v1/admin/users/{publicId}/role}).
     * <ol>
     *   <li>Từ chối nếu đích là chính Admin đang thao tác hoặc là tài khoản Admin ({@code ADMIN_ACCOUNT_PROTECTED}).</li>
     *   <li>Khoá hàng user (cùng hàng mà việc tạo vault khoá) để không đua với tạo vault.</li>
     *   <li>Nếu role hiện tại đã đúng role mới thì trả về luôn (idempotent).</li>
     *   <li>Không cho bỏ role Vault Owner khi đã có vault ({@code ADMIN_OWNER_HAS_VAULT}).</li>
     *   <li>Xoá các role quản lý được, gắn role mới, ghi audit {@code ADMIN_USER_ROLE_CHANGED} (trước/sau).</li>
     * </ol>
     *
     * @throws BusinessException {@code RESOURCE_NOT_FOUND}, {@code ADMIN_ACCOUNT_PROTECTED}, {@code ADMIN_OWNER_HAS_VAULT}, {@code ADMIN_ROLE_NOT_ASSIGNABLE}
     */
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
            return query.getUser(publicId, null);
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
        return query.getUser(publicId, null);
    }

    /**
     * Locks (ACTIVE to LOCKED) or unlocks (LOCKED to ACTIVE) an account. Locking revokes every issued token, so
     * unlocking later never revives an old session. Admin accounts and the caller are protected; repeating the
     * requested state is a no-op.
     */
    @Transactional
    public AdminUserResponse setLocked(Long adminUserId, UUID publicId, boolean lock, String reason) {
        User found = users.findByPublicId(publicId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (found.getUserId().equals(adminUserId)) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_PROTECTED);
        }
        User target = users.findLiveAccountForUpdate(found.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (userRoles.findByUserIdWithRole(target.getUserId()).stream()
                .anyMatch(link -> "ROLE_ADMIN".equals(link.getRole().getRoleCode()))) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_PROTECTED);
        }
        String from = lock ? "ACTIVE" : "LOCKED";
        String to = lock ? "LOCKED" : "ACTIVE";
        if (to.equals(target.getStatus())) {
            return query.getUser(publicId, null);
        }
        if (!from.equals(target.getStatus())) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_STATE_INVALID);
        }
        if (lock && vaults.existsByOwnerUserIdAndStatusIn(target.getUserId(), AdminAccountStatus.LOCK_BLOCKING_VAULT_STATUSES)) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_IN_HANDOVER);
        }
        target.setStatus(to);
        if (lock) {
            target.revokeSessions();
        }
        users.flush();

        Map<String, Object> context = new java.util.HashMap<>(Map.of("result", "SUCCESS"));
        String note = !lock || reason == null ? "" : reason.trim();
        if (!note.isEmpty()) {
            context.put("reason", note);
        }
        record(lock ? AuditAction.ADMIN_USER_LOCKED : AuditAction.ADMIN_USER_UNLOCKED, adminUserId, target.getUserId(),
                "{\"status\":\"" + from + "\"}", "{\"status\":\"" + to + "\"}", context);
        return query.getUser(publicId, null);
    }

    /** Chuẩn hoá role (trim, in hoa, thêm tiền tố ROLE_) và đảm bảo nằm trong {@link #ASSIGNABLE}; sai -> {@code ADMIN_ROLE_NOT_ASSIGNABLE}. */
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

    /** Lấy entity {@link Role} theo mã; thiếu trong DB là lỗi cấu hình/migration nên ném {@link IllegalStateException}. */
    private Role requireRole(String code) {
        return roles.findByRoleCode(code)
                .orElseThrow(() -> new IllegalStateException("Required role not found: " + code));
    }

    /** Dựng mảng JSON chuỗi (ví dụ {@code ["ROLE_A","ROLE_B"]}) cho trạng thái trước/sau trong audit. */
    private static String json(List<String> values) {
        return values.stream().map(value -> "\"" + value + "\"").collect(Collectors.joining(",", "[", "]"));
    }

    /** Ghi một {@link AuditEvent} do USER (Admin) thực hiện lên thực thể USER đích, kèm trạng thái trước/sau và ngữ cảnh. */
    private void record(AuditAction action, Long adminUserId, Long targetUserId, String before, String after,
                        Map<String, Object> context) {
        audit.record(new AuditEvent(action, AuditActorType.USER, adminUserId, null, "USER", targetUserId,
                before, after, null, context, action.name(), null));
    }
}
