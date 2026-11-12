package com.legacyvault.admin.user.controller;

import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.service.AdminUserQueryService;
import com.legacyvault.common.web.PageResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * ROLE_ADMIN-only read API for account search and detail.
 * <p>Base path {@code /api/v1/admin/users}. Chỉ đọc; dữ liệu do {@link AdminUserQueryService} dựng.
 * Tham số được kiểm tra bằng Bean Validation (độ dài, regex trạng thái, giới hạn trang).
 */
@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserQueryController {
    private final AdminUserQueryService service;

    /** @param service service tra cứu tài khoản (được Spring inject). */
    public AdminUserQueryController(AdminUserQueryService service) {
        this.service = service;
    }

    /**
     * {@code GET /api/v1/admin/users} - tìm và liệt kê tài khoản có phân trang.
     *
     * @param query       từ khoá tìm theo tên/email; nếu là UUID đầy đủ thì tìm đúng tài khoản có publicId đó
     * @param role        lọc theo role (ví dụ ROLE_VAULT_OWNER)
     * @param status      PENDING | ACTIVE | LOCKED | IN_PROCESS | DELETED
     * @param vaultStatus NO_VAULT | ACTIVE | IN_PROCESS | ARCHIVED (chỉ hợp lệ khi lọc role Vault Owner)
     * @param page        trang từ 0
     * @param size        1-100, mặc định 20
     * @return trang {@link AdminUserResponse}, mới tạo trước
     */
    @GetMapping
    public PageResponse<AdminUserResponse> listUsers(
            @RequestParam(required = false) @Size(max = 100) String query,
            @RequestParam(required = false) @Size(max = 50) String role,
            @RequestParam(required = false) @Pattern(regexp = "(?i)PENDING|ACTIVE|LOCKED|IN_PROCESS|DELETED") String status,
            @RequestParam(required = false) @Pattern(regexp = "(?i)NO_VAULT|ACTIVE|IN_PROCESS|ARCHIVED") String vaultStatus,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.listUsers(query, role, status, vaultStatus, page, size);
    }

    /**
     * {@code GET /api/v1/admin/users/{publicId}} - xem một tài khoản.
     *
     * @param role tuỳ chọn; khi là role nghiệp vụ, tài khoản đã xoá hoặc chưa ACTIVE/LOCKED trả 404
     * @return {@link AdminUserResponse}; 404 {@code RESOURCE_NOT_FOUND} nếu không tồn tại
     */
    @GetMapping("/{publicId}")
    public AdminUserResponse getUser(@PathVariable UUID publicId,
            @RequestParam(required = false) @Size(max = 50) String role) {
        return service.getUser(publicId, role);
    }
}
