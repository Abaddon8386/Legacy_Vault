package com.legacyvault.admin.user.controller;

import com.legacyvault.admin.user.dto.AdminCreateUserRequest;
import com.legacyvault.admin.user.dto.AdminLockUserRequest;
import com.legacyvault.admin.user.dto.AdminResetPasswordRequest;
import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.service.AdminUserManagementService;
import com.legacyvault.common.security.CustomUserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Chỉ ROLE_ADMIN: tạo tài khoản, role khi tạo (Staff, Legal, Vault Owner), khóa/mở khóa và đặt lại mật khẩu. */
@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserManagementController {
    private final AdminUserManagementService service;

    public AdminUserManagementController(AdminUserManagementService service) {
        this.service = service;
    }

    /**
     * Tạo tài khoản mới (Staff, Legal hoặc Vault Owner) với mật khẩu ban đầu do Admin đặt.
     *
     * @param admin   principal của Admin đang đăng nhập (ghi vào audit)
     * @param request thông tin tài khoản và role cần cấp
     * @return bản ghi công khai của tài khoản vừa tạo (HTTP 201)
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserResponse createUser(@AuthenticationPrincipal CustomUserPrincipal admin,
                                        @Valid @RequestBody AdminCreateUserRequest request) {
        return service.createUser(admin.userId(), request);
    }

    /**
     * Khóa tài khoản (ACTIVE sang LOCKED) và thu hồi mọi phiên đăng nhập hiện có.
     * Body là tùy chọn; {@code reason} (nếu có) chỉ được ghi vào audit.
     *
     * @param publicId public ID của tài khoản bị khóa
     * @return tài khoản sau khi khóa
     */
    @PostMapping("/{publicId}/lock")
    public AdminUserResponse lockUser(@AuthenticationPrincipal CustomUserPrincipal admin,
                                      @PathVariable UUID publicId,
                                      @Valid @RequestBody(required = false) AdminLockUserRequest request) {
        return service.setLocked(admin.userId(), publicId, true, request == null ? null : request.reason());
    }

    /**
     * Mở khóa tài khoản (LOCKED sang ACTIVE). Token cũ không sống lại vì authVersion đã tăng lúc khóa.
     *
     * @param publicId public ID của tài khoản cần mở khóa
     * @return tài khoản sau khi mở khóa
     */
    @PostMapping("/{publicId}/unlock")
    public AdminUserResponse unlockUser(@AuthenticationPrincipal CustomUserPrincipal admin,
                                        @PathVariable UUID publicId) {
        return service.setLocked(admin.userId(), publicId, false, null);
    }

    /**
     * Đặt mật khẩu mới cho tài khoản xác định bằng e-mail. Admin cung cấp cả hai giá trị trong body;
     * response là bản ghi công khai của tài khoản (không bao giờ có mật khẩu). Mọi phiên của tài khoản đó bị thu hồi.
     * Segment đường dẫn cố định, nên không xung đột với các route {@code /{publicId}/...}.
     *
     * @param admin   Admin đã xác thực (ghi vào audit)
     * @param request e-mail đích và mật khẩu mới
     * @return tài khoản đích sau thay đổi
     */
    @PostMapping("/reset-password")
    public AdminUserResponse resetPassword(@AuthenticationPrincipal CustomUserPrincipal admin,
                                           @Valid @RequestBody AdminResetPasswordRequest request) {
        return service.resetPassword(admin.userId(), request);
    }
}
