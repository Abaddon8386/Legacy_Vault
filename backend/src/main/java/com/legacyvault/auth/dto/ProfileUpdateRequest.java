package com.legacyvault.auth.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body của {@code PATCH /api/v1/auth/me} (PS-79): cập nhật một phần hồ sơ cá nhân. Trường nào {@code null} thì giữ nguyên.
 * {@code currentPassword} chỉ là bằng chứng xác thực lại, không phải trường tài khoản có thể ghi. Đổi email hoặc mật
 * khẩu bắt buộc kèm {@code currentPassword}. Mọi trường lạ đều bị từ chối qua {@link #rejectUnrecognizedField}.
 */
public class ProfileUpdateRequest {
    /**
     * Họ tên mới, 1-150 ký tự và không được chỉ chứa khoảng trắng.
     */
    @Size(min = 1, max = 150)
    @Pattern(regexp = ".*\\S.*")
    private String fullName;

    /**
     * Số điện thoại mới: chuỗi rỗng để xóa, hoặc 8-15 chữ số có thể bắt đầu bằng dấu +.
     */
    @Pattern(regexp = "^$|^\\+?[0-9]{8,15}$")
    private String phoneNumber;

    /**
     * Email mới (đổi email xóa xác minh email cũ và cần {@code currentPassword}).
     */
    @Email
    @Size(max = 254)
    @Pattern(regexp = ".*\\S.*")
    private String email;

    /**
     * Mật khẩu mới (phải thỏa {@link com.legacyvault.auth.policy.PasswordPolicy}; cần {@code currentPassword}).
     */
    private String password;
    /**
     * Mật khẩu hiện tại dùng để xác thực lại khi đổi email hoặc mật khẩu.
     */
    private String currentPassword;

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getCurrentPassword() { return currentPassword; }
    public void setCurrentPassword(String currentPassword) { this.currentPassword = currentPassword; }

    /**
     * Bắt mọi thuộc tính JSON không được khai báo và ném {@link IllegalArgumentException}, nhằm chặn việc ghi
     * đè các trường nhạy cảm (mass-assignment) như role hay trạng thái.
     *
     * @param field tên trường lạ
     * @param value giá trị của trường lạ (bỏ qua)
     * @throws IllegalArgumentException luôn ném
     */
    @JsonAnySetter
    public void rejectUnrecognizedField(String field, Object value) {
        throw new IllegalArgumentException("Unsupported profile field");
    }
}
