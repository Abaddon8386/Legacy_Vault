package com.legacyvault.admin.user.dto;

import com.legacyvault.auth.policy.ValidPassword;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/v1/admin/users/reset-password}: an Admin sets a new password for any non-Admin account.
 *
 * <ul>
 *   <li>{@code email}: address of the target account. It is normalised with {@code EmailNormalizer} before the
 *       lookup, so letter case and surrounding spaces do not matter.</li>
 *   <li>{@code newPassword}: the password to store. It must satisfy the same policy as sign-up
 *       ({@link ValidPassword}, 8 to 72 characters); the server hashes it and never returns or logs it.</li>
 * </ul>
 */
public record AdminResetPasswordRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 8, max = 72) @ValidPassword String newPassword) {

    /** Keeps the new password out of logs and accidental toString() output; only the email is shown. */
    @Override
    public String toString() {
        return "AdminResetPasswordRequest[email=" + email + "]";
    }
}
