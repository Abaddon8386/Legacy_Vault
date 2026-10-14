package com.legacyvault.asset.validation;

import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/** Spring tạo validator này nên đọc được giới hạn từ cấu hình (không hardcode). */
public class PayloadSizeValidator implements ConstraintValidator<PayloadSize, String> {

	private final int maxBytes;

	public PayloadSizeValidator(@Value("${legacyvault.asset.max-payload-bytes:65536}") int maxBytes) {
		this.maxBytes = maxBytes;
	}

	@Override
	public boolean isValid(String value, ConstraintValidatorContext context) {
		return value == null || value.getBytes(StandardCharsets.UTF_8).length <= maxBytes;
	}
}
