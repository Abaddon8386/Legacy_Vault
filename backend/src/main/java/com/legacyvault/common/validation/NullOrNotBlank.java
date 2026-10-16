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
 * Cho request cập nhật một phần (PATCH): vắng/null = không đổi (hợp lệ); đã gửi thì không được rỗng hay chỉ có khoảng trắng.
 * {@code @NotBlank} không dùng được vì nó bắt buộc phải có giá trị.
 */
@Target({ ElementType.FIELD, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = NullOrNotBlank.Validator.class)
public @interface NullOrNotBlank {

	String message() default "validation.NotBlank";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<NullOrNotBlank, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return value == null || !value.isBlank();
		}
	}
}
