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

/** ROLE_ADMIN-only account creation, role at creation (Staff, Legal, Vault Owner), lock/unlock and password reset. */
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

    /**
     * Sets a new password for the account identified by e-mail. The admin supplies both values in the body; the
     * response is the account's public record (never the password). All sessions of that account are revoked.
     * Fixed path segment, so it does not clash with the {@code /{publicId}/...} routes.
     *
     * @param admin   the authenticated Admin (recorded in the audit trail)
     * @param request target e-mail and new password
     * @return the target account after the change
     */
    @PostMapping("/reset-password")
    public AdminUserResponse resetPassword(@AuthenticationPrincipal CustomUserPrincipal admin,
                                           @Valid @RequestBody AdminResetPasswordRequest request) {
        return service.resetPassword(admin.userId(), request);
    }
}
