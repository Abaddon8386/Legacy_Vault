package com.legacyvault.admin.user.service;

import com.legacyvault.admin.user.dto.AdminCreateUserRequest;
import com.legacyvault.admin.user.dto.AdminResetPasswordRequest;
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

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Cấp tài khoản và gán role chỉ dành cho Admin. Chỉ các role Staff, Legal và Vault Owner được
 * cấp ở đây; tài khoản Admin không bao giờ được tạo hay sửa qua API này, và Admin không thể đổi
 * role của chính mình. Role đọc từ database ở mỗi request, nên thay đổi có hiệu lực ngay.
 * Admin cũng có thể đặt mật khẩu mới cho mọi tài khoản không phải Admin khác ({@link #resetPassword}).
 */
@Service
public class AdminUserManagementService {
    // Chỉ ba role này được Admin cấp khi tạo tài khoản; ROLE_ADMIN và ROLE_BENEFICIARY không nằm trong danh sách.
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

    /**
     * Tạo tài khoản do Admin cấp (status ACTIVE) và gán đúng một role.
     *
     * <p>Luồng: chuẩn hóa role và email, kiểm tra email trùng, băm mật khẩu bằng {@link PasswordEncoder},
     * lưu user rồi lưu liên kết role (ghi {@code assignedByUserId}), ghi audit {@code ADMIN_USER_CREATED}.
     *
     * @param adminUserId id của Admin thực hiện
     * @param request    thông tin tài khoản
     * @return tài khoản vừa tạo
     * @throws BusinessException EMAIL_ALREADY_EXISTS nếu email đã dùng; ADMIN_ROLE_NOT_ASSIGNABLE nếu role không được phép cấp
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
            // Flush ngay để ràng buộc unique của email nổ tại đây. Bước existsByEmail phía trên không đủ khi hai request tạo cùng một email đồng thời, nên phải bắt lỗi trùng.
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
     * Khóa (ACTIVE sang LOCKED) hoặc mở khóa (LOCKED sang ACTIVE) một tài khoản. Khóa sẽ thu hồi mọi token đã cấp, nên
     * mở khóa sau này không làm sống lại phiên cũ. Tài khoản Admin và người gọi được bảo vệ; lặp lại
     * trạng thái được yêu cầu là no-op.
     */
    @Transactional
    public AdminUserResponse setLocked(Long adminUserId, UUID publicId, boolean lock, String reason) {
        User found = users.findByPublicId(publicId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (found.getUserId().equals(adminUserId)) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_PROTECTED);
        }
        // Khóa dòng user (PESSIMISTIC_WRITE) để các thay đổi trạng thái của Admin được tuần tự hóa; hàm này tìm được cả tài khoản LOCKED/PENDING.
        User target = users.findLiveAccountForUpdate(found.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (userRoles.findByUserIdWithRole(target.getUserId()).stream()
                .anyMatch(link -> "ROLE_ADMIN".equals(link.getRole().getRoleCode()))) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_PROTECTED);
        }
        // Đã ở trạng thái đích thì trả về luôn (idempotent); trạng thái nguồn không đúng (ví dụ PENDING) thì báo ADMIN_ACCOUNT_STATE_INVALID.
        String from = lock ? "ACTIVE" : "LOCKED";
        String to = lock ? "LOCKED" : "ACTIVE";
        if (to.equals(target.getStatus())) {
            return query.getUser(publicId, null);
        }
        if (!from.equals(target.getStatus())) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_STATE_INVALID);
        }
        // Chủ Vault đang trong quy trình hậu sự (hoặc Vault đã ARCHIVED) không được khóa, để không làm gián đoạn việc xác minh/bàn giao.
        if (lock && vaults.existsByOwnerUserIdAndStatusIn(target.getUserId(), AdminAccountStatus.LOCK_BLOCKING_VAULT_STATUSES)) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_IN_HANDOVER);
        }
        target.setStatus(to);
        if (lock) {
            // Tăng authVersion: JwtAuthenticationFilter sẽ từ chối mọi token cũ của tài khoản này.
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

    /**
     * Đặt mật khẩu mới cho tài khoản có e-mail trong request, thay mặt một Admin.
     *
     * <p>Các bước: chuẩn hóa e-mail và tìm tài khoản (404 {@code RESOURCE_NOT_FOUND} nếu không có hoặc đã xóa); lấy
     * cùng khóa dòng như các thay đổi trạng thái khác của admin; từ chối tài khoản Admin (kể cả người gọi, vốn phải dùng
     * luồng đổi mật khẩu thông thường) bằng 409 {@code ADMIN_ACCOUNT_PROTECTED}; từ chối tài khoản không đăng nhập được
     * bằng mật khẩu (chỉ dùng Google) bằng 409 {@code ADMIN_ACCOUNT_STATE_INVALID}; băm mật khẩu mới bằng
     * {@link PasswordEncoder} của ứng dụng; tăng {@code authVersion} để mọi token cấp trước khi đặt lại mất hiệu lực
     * (người dùng phải đăng nhập lại bằng mật khẩu mới); ghi một bản ghi audit
     * {@link AuditAction#ADMIN_USER_PASSWORD_RESET}. Bản thân mật khẩu không bao giờ được lưu trong audit,
     * log hay response.
     *
     * <p>Tài khoản bị khóa và đang chờ vẫn đặt lại được: trạng thái giữ nguyên, nên tài khoản bị khóa vẫn bị khóa.
     *
     * @param adminUserId id của Admin thực hiện
     * @param request     e-mail đích và mật khẩu mới (đã kiểm tra policy)
     * @return tài khoản đích sau thay đổi
     */
    @Transactional
    public AdminUserResponse resetPassword(Long adminUserId, AdminResetPasswordRequest request) {
        String email = EmailNormalizer.normalize(request.email());
        User found = users.findByEmail(email)
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
        if (!target.isPasswordLoginAllowed()) {
            throw new BusinessException(ErrorCode.ADMIN_ACCOUNT_STATE_INVALID);
        }
        target.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        // Tăng authVersion để mọi token phát hành trước khi đặt lại mật khẩu mất hiệu lực; người dùng phải đăng nhập lại.
        target.advanceAuthVersion(LocalDateTime.now(ZoneOffset.UTC));
        users.flush();

        record(AuditAction.ADMIN_USER_PASSWORD_RESET, adminUserId, target.getUserId(), null, null,
                Map.of("result", "SUCCESS"));
        return query.getUser(target.getPublicId(), null);
    }

    /**
     * Chuẩn hóa mã role (viết hoa, thêm tiền tố ROLE_ nếu thiếu) và kiểm tra có thuộc {@link #ASSIGNABLE} không.
     *
     * @throws BusinessException ADMIN_ROLE_NOT_ASSIGNABLE nếu role không được phép cấp
     */
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

    /**
     * Lấy role theo mã. Thiếu role trong bảng {@code roles} là lỗi dữ liệu/migration nên ném IllegalStateException thay vì lỗi nghiệp vụ.
     */
    private Role requireRole(String code) {
        return roles.findByRoleCode(code)
                .orElseThrow(() -> new IllegalStateException("Required role not found: " + code));
    }

    /**
     * Dựng mảng JSON chuỗi thủ công cho stateAfter của audit. Giá trị là mã role đã whitelist nên không cần escape.
     */
    private static String json(List<String> values) {
        return values.stream().map(value -> "\"" + value + "\"").collect(Collectors.joining(",", "[", "]"));
    }

    /**
     * Ghi audit cho thao tác Admin: actor là USER (Admin), entity là USER (tài khoản bị tác động); stepId dùng chính tên action.
     */
    private void record(AuditAction action, Long adminUserId, Long targetUserId, String before, String after,
                        Map<String, Object> context) {
        audit.record(new AuditEvent(action, AuditActorType.USER, adminUserId, null, "USER", targetUserId,
                before, after, null, context, action.name(), null));
    }
}
