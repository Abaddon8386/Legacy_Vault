package com.legacyvault.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        // Họ tên không được null, rỗng hoặc chỉ chứa khoảng trắng.
        // Độ dài tối đa là 150 ký tự.
        @NotBlank(message = "{auth.register.full-name.required}")
        @Size(max = 150, message = "{auth.register.full-name.max}")
        String fullName,

        // Email bắt buộc, phải đúng định dạng email và không vượt quá 254 ký tự.
        // Việc kiểm tra email đã tồn tại sẽ được xử lý trong Service/Repository sau này.
        @NotBlank(message = "{auth.register.email.required}")
        @Email(message = "{auth.register.email.invalid}")
        @Size(max = 254, message = "{auth.register.email.max}")
        String email,

        // Mật khẩu bắt buộc, dài từ 8 đến 72 ký tự theo contract PS-9.
        // Đây chỉ là kiểm tra dữ liệu đầu vào, không phải mã hóa mật khẩu.
        @NotBlank(message = "{auth.register.password.required}")
        @Size(min = 8, max = 72, message = "{auth.register.password.size}")
        String password,

        // Số điện thoại không bắt buộc.
        // Nếu có nhập, cho phép dấu + ở đầu và từ 8 đến 15 chữ số.
        @Pattern(regexp = "^$|^\\+?[0-9]{8,15}$", message = "{auth.register.phone.invalid}")
        String phone
) {}