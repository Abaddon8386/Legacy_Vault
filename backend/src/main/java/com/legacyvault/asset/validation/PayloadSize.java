package com.legacyvault.asset.validation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Payload Asset không vượt {@code legacyvault.asset.max-payload-bytes} (mặc định 64 KB — D-API-29), đo theo byte UTF-8
 * chứ không theo số ký tự. Null hợp lệ (bắt buộc hay không do {@code @NotBlank} quyết định).
 */
@Target({ ElementType.FIELD, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PayloadSizeValidator.class)
public @interface PayloadSize {

	String message() default "validation.PayloadSize";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};
}
