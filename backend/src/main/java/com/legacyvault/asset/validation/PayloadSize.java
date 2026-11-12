package com.legacyvault.asset.validation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Annotation validate: payload Asset không vượt {@code legacyvault.asset.max-payload-bytes} (mặc định 64 KB — D-API-29), đo theo byte UTF-8
 * chứ không theo số ký tự. Null hợp lệ (bắt buộc hay không do {@code @NotBlank} quyết định).
 * Dùng trên {@code CreateAssetRequest.payload} và {@code UpdateAssetRequest.payload}; xử lý bởi {@link PayloadSizeValidator}.
 */
@Target({ ElementType.FIELD, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PayloadSizeValidator.class)
public @interface PayloadSize {

	/**
	 * Message key lỗi validation.
	 */
	String message() default "validation.PayloadSize";

	/**
	 * Nhóm validation (mặc định rỗng).
	 */
	Class<?>[] groups() default {};

	/**
	 * Metadata payload của Bean Validation (không dùng).
	 */
	Class<? extends Payload>[] payload() default {};
}
