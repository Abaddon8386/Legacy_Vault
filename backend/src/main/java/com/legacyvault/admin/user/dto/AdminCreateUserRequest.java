package com.legacyvault.admin.user.dto;

import com.legacyvault.auth.policy.ValidPassword;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Tài khoản do Admin cấp: Admin chọn mật khẩu ban đầu và đúng một role được phép gán. */
public record AdminCreateUserRequest(
        @NotBlank @Size(max = 150) String fullName,
        @NotBlank @Email @Size(max = 254) String email,
        @Pattern(regexp = "^$|^\\+?[0-9]{8,15}$") String phone,
        @NotBlank @Size(min = 8, max = 72) @ValidPassword String password,
        @NotBlank String role) {

    /** Giữ mật khẩu ban đầu khỏi log và đầu ra toString() ngoài ý muốn. */
    @Override
    public String toString() {
        return "AdminCreateUserRequest[email=" + email + ", role=" + role + "]";
    }
}
