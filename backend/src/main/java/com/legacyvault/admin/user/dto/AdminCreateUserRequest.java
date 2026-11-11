package com.legacyvault.admin.user.dto;

import com.legacyvault.auth.policy.ValidPassword;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Admin-provisioned account: the Admin chooses the initial password and exactly one assignable role. */
public record AdminCreateUserRequest(
        @NotBlank @Size(max = 150) String fullName,
        @NotBlank @Email @Size(max = 254) String email,
        @Pattern(regexp = "^$|^\\+?[0-9]{8,15}$") String phone,
        @NotBlank @Size(min = 8, max = 72) @ValidPassword String password,
        @NotBlank String role) {

    /** Keeps the initial password out of logs and accidental toString() output. */
    @Override
    public String toString() {
        return "AdminCreateUserRequest[email=" + email + ", role=" + role + "]";
    }
}
