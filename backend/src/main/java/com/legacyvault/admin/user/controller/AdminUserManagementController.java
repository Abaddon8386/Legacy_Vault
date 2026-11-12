package com.legacyvault.admin.user.controller;

import com.legacyvault.admin.user.dto.AdminCreateUserRequest;
import com.legacyvault.admin.user.dto.AdminLockUserRequest;
import com.legacyvault.admin.user.dto.AdminUpdateUserRoleRequest;
import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.service.AdminUserManagementService;
import com.legacyvault.common.security.CustomUserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * ROLE_ADMIN-only account creation, role assignment (Staff, Legal, Vault Owner) and lock/unlock.
 * <p>Base path {@code /api/v1/admin/users}. Các endpoint ghi (tạo, khoá/mở khoá, đổi vai trò); phần đọc nằm ở
 * {@link AdminUserQueryController}. Controller chỉ lấy id Admin từ {@code CustomUserPrincipal} rồi gọi
 * {@link AdminUserManagementService}, nơi chứa toàn bộ nghiệp vụ và ghi audit.
 */
@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserManagementController {
    private final AdminUserManagementService service;

    /** @param service service nghiệp vụ quản lý tài khoản (được Spring inject). */
    public AdminUserManagementController(AdminUserManagementService service) {
        this.service = service;
    }

    /**
     * {@code POST /api/v1/admin/users} - Admin tạo tài khoản mới (Staff, Legal hoặc Vault Owner).
     *
     * @param admin   Admin đang đăng nhập
     * @param request họ tên, email, SĐT (tùy chọn), mật khẩu ban đầu, role
     * @return 201 {@link AdminUserResponse}; 409 {@code EMAIL_ALREADY_EXISTS} nếu email đã dùng; {@code ADMIN_ROLE_NOT_ASSIGNABLE} nếu role không được cấp
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserResponse createUser(@AuthenticationPrincipal CustomUserPrincipal admin,
                                        @Valid @RequestBody AdminCreateUserRequest request) {
        return service.createUser(admin.userId(), request);
    }

    /**
     * {@code POST /api/v1/admin/users/{publicId}/lock} - khoá tài khoản (ACTIVE -> LOCKED), thu hồi mọi token đã cấp.
     *
     * @param publicId id công khai của tài khoản cần khoá
     * @param request  body tùy chọn chứa {@code reason} (tối đa 255 ký tự) ghi vào audit
     * @return tài khoản sau khi khoá; lỗi {@code ADMIN_ACCOUNT_PROTECTED}, {@code ADMIN_ACCOUNT_IN_HANDOVER}, {@code ADMIN_ACCOUNT_STATE_INVALID}, {@code RESOURCE_NOT_FOUND}
     */
    @PostMapping("/{publicId}/lock")
    public AdminUserResponse lockUser(@AuthenticationPrincipal CustomUserPrincipal admin,
                                      @PathVariable UUID publicId,
                                      @Valid @RequestBody(required = false) AdminLockUserRequest request) {
        return service.setLocked(admin.userId(), publicId, true, request == null ? null : request.reason());
    }

    /**
     * {@code POST /api/v1/admin/users/{publicId}/unlock} - mở khoá tài khoản (LOCKED -> ACTIVE). Không có body.
     * Token cũ không được khôi phục vì lúc khoá đã bị thu hồi.
     */
    @PostMapping("/{publicId}/unlock")
    public AdminUserResponse unlockUser(@AuthenticationPrincipal CustomUserPrincipal admin,
                                        @PathVariable UUID publicId) {
        return service.setLocked(admin.userId(), publicId, false, null);
    }

    /**
     * {@code PUT /api/v1/admin/users/{publicId}/role} - đổi vai trò nghiệp vụ duy nhất của tài khoản.
     * Không đổi được role của chính Admin hoặc của Admin khác; không bỏ role Vault Owner nếu đã có vault.
     *
     * @param request body {@code {"role": "..."}}
     * @return tài khoản sau khi đổi; role mới áp dụng ngay vì role được đọc từ DB mỗi request
     */
    @PutMapping("/{publicId}/role")
    public AdminUserResponse changeRole(@AuthenticationPrincipal CustomUserPrincipal admin,
                                        @PathVariable UUID publicId,
                                        @Valid @RequestBody AdminUpdateUserRoleRequest request) {
        return service.changeRole(admin.userId(), publicId, request);
    }
}
