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

/** API đọc chỉ dành cho ROLE_ADMIN: tìm kiếm tài khoản và xem chi tiết. */
@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserQueryController {
    private final AdminUserQueryService service;

    public AdminUserQueryController(AdminUserQueryService service) {
        this.service = service;
    }

    /**
     * Tìm kiếm và phân trang danh sách tài khoản cho Admin.
     *
     * @param query       chuỗi tìm theo tên/email; nếu là UUID đầy đủ thì khớp thêm theo public ID
     * @param role        lọc theo role (ví dụ ROLE_VAULT_OWNER)
     * @param status      lọc theo trạng thái tài khoản (PENDING, ACTIVE, LOCKED, IN_PROCESS, DELETED)
     * @param vaultStatus lọc theo nhóm trạng thái Vault; chỉ hợp lệ khi đồng thời lọc role Vault Owner
     * @param page        số trang (từ 0)
     * @param size        số phần tử mỗi trang (1 đến 100)
     * @return một trang tài khoản
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
     * Xem chi tiết một tài khoản theo public ID.
     *
     * @param publicId public ID của tài khoản
     * @param role     (tùy chọn) nếu là role nghiệp vụ thì chỉ chấp nhận tài khoản ACTIVE/LOCKED chưa bị xóa
     * @return thông tin tài khoản; 404 nếu không tồn tại hoặc không khớp bộ lọc role
     */
    @GetMapping("/{publicId}")
    public AdminUserResponse getUser(@PathVariable UUID publicId,
            @RequestParam(required = false) @Size(max = 50) String role) {
        return service.getUser(publicId, role);
    }
}
