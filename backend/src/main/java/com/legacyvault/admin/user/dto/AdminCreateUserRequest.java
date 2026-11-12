package com.legacyvault.admin.user.dto;

import com.legacyvault.auth.policy.ValidPassword;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Admin-provisioned account: the Admin chooses the initial password and exactly one assignable role.
 * <p>Body của {@code POST /api/v1/admin/users}. Ràng buộc: họ tên tối đa 150; email hợp lệ tối đa 254;
 * SĐT rỗng hoặc 8-15 chữ số (có thể có dấu +); mật khẩu 8-72 ký tự và đạt chính sách {@code @ValidPassword};
 * role bắt buộc (STAFF_EXECUTOR, LEGAL_VERIFIER hoặc VAULT_OWNER, có hoặc không tiền tố ROLE_).
 */
public record AdminCreateUserRequest(
        @NotBlank @Size(max = 150) String fullName,
        @NotBlank @Email @Size(max = 254) String email,
        @Pattern(regexp = "^$|^\\+?[0-9]{8,15}$") String phone,
        @NotBlank @Size(min = 8, max = 72) @ValidPassword String password,
        @NotBlank String role) {

    /** Keeps the initial password out of logs and accidental toString() output. Chỉ in email và role. */
    @Override
    public String toString() {
        return "AdminCreateUserRequest[email=" + email + ", role=" + role + "]";
    }
}
