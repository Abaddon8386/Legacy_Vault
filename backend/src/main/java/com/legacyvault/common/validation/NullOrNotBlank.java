package com.legacyvault.common.validation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

/**
 * Ràng buộc validation tùy chỉnh dùng trên field/thành phần record của DTO.
 * Cho request cập nhật một phần (PATCH): vắng/null = không đổi (hợp lệ); đã gửi thì không được rỗng hay chỉ có khoảng trắng.
 * {@code @NotBlank} không dùng được vì nó bắt buộc phải có giá trị.
 * Khi vi phạm, message key mặc định là {@code validation.NotBlank} (xem {@code ApiErrorFactory}).
 */
@Target({ ElementType.FIELD, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = NullOrNotBlank.Validator.class)
public @interface NullOrNotBlank {

	/** Khóa thông điệp lỗi khi vi phạm. */
	String message() default "validation.NotBlank";

	/** Nhóm validation (theo chuẩn Jakarta Validation). */
	Class<?>[] groups() default {};

	/** Payload tùy chọn (theo chuẩn Jakarta Validation). */
	Class<? extends Payload>[] payload() default {};

	/** Bộ kiểm tra cho {@link NullOrNotBlank} trên giá trị chuỗi. */
	class Validator implements ConstraintValidator<NullOrNotBlank, String> {

		@Override
		/**
		 * @param value   giá trị cần kiểm tra
		 * @param context ngữ cảnh validation (không dùng)
		 * @return {@code true} nếu giá trị null hoặc không chỉ gồm khoảng trắng
		 */
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return value == null || !value.isBlank();
		}
	}
}
