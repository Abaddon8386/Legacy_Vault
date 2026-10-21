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

/** ROLE_ADMIN-only read API for account search and detail. */
@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserQueryController {
    private final AdminUserQueryService service;

    public AdminUserQueryController(AdminUserQueryService service) {
        this.service = service;
    }

    @GetMapping
    public PageResponse<AdminUserResponse> listUsers(
            @RequestParam(required = false) @Size(max = 100) String query,
            @RequestParam(required = false) @Size(max = 50) String role,
            @RequestParam(required = false) @Pattern(regexp = "(?i)PENDING|ACTIVE|DELETED") String status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.listUsers(query, role, status, page, size);
    }

    @GetMapping("/{publicId}")
    public AdminUserResponse getUser(@PathVariable UUID publicId) {
        return service.getUser(publicId);
    }
}
