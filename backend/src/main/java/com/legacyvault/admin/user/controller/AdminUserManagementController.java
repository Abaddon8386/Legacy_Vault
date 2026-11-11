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

/** ROLE_ADMIN-only account creation, role assignment (Staff, Legal, Vault Owner) and lock/unlock. */
@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserManagementController {
    private final AdminUserManagementService service;

    public AdminUserManagementController(AdminUserManagementService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserResponse createUser(@AuthenticationPrincipal CustomUserPrincipal admin,
                                        @Valid @RequestBody AdminCreateUserRequest request) {
        return service.createUser(admin.userId(), request);
    }

    @PostMapping("/{publicId}/lock")
    public AdminUserResponse lockUser(@AuthenticationPrincipal CustomUserPrincipal admin,
                                      @PathVariable UUID publicId,
                                      @Valid @RequestBody(required = false) AdminLockUserRequest request) {
        return service.setLocked(admin.userId(), publicId, true, request == null ? null : request.reason());
    }

    @PostMapping("/{publicId}/unlock")
    public AdminUserResponse unlockUser(@AuthenticationPrincipal CustomUserPrincipal admin,
                                        @PathVariable UUID publicId) {
        return service.setLocked(admin.userId(), publicId, false, null);
    }

    @PutMapping("/{publicId}/role")
    public AdminUserResponse changeRole(@AuthenticationPrincipal CustomUserPrincipal admin,
                                        @PathVariable UUID publicId,
                                        @Valid @RequestBody AdminUpdateUserRoleRequest request) {
        return service.changeRole(admin.userId(), publicId, request);
    }
}
