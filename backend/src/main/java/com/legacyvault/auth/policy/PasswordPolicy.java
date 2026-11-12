package com.legacyvault.auth.policy;

import java.nio.charset.StandardCharsets;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Bộ kiểm tra mật khẩu dùng chung cho đăng ký, đổi mật khẩu và khôi phục mật khẩu (validator của
 * {@link ValidPassword}). Giới hạn BCrypt tính theo byte chứ không theo ký tự UTF-16.
 *
 * Mật khẩu hợp lệ khi: không null/blank, 8-72 ký tự, không chứa ký tự NUL, tối đa 72 byte UTF-8 và không có
 * surrogate đơn lẻ (cặp surrogate phải đầy đủ).
 */
public class PasswordPolicy implements ConstraintValidator<ValidPassword,String> {
    /**
     * Kiểm tra một mật khẩu theo chính sách trên.
     *
     * @param value   mật khẩu cần kiểm tra
     * @param context ngữ cảnh validator (có thể {@code null} khi gọi trực tiếp từ service)
     * @return {@code true} nếu mật khẩu hợp lệ
     */
    @Override public boolean isValid(String value,ConstraintValidatorContext context) {
        if(value==null || value.isBlank() || value.length()<8 || value.length()>72
                || value.indexOf('\0')>=0 || value.getBytes(StandardCharsets.UTF_8).length>72) return false;
        for(int i=0;i<value.length();i++) {
            char c=value.charAt(i);
            if(Character.isHighSurrogate(c)) {
                if(++i>=value.length() || !Character.isLowSurrogate(value.charAt(i))) return false;
            } else if(Character.isLowSurrogate(c)) return false;
        }
        return true;
    }
}
