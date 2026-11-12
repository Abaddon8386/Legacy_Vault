package com.legacyvault.asset.validation;

import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Validator cho {@link PayloadSize}. Là bean Spring nên đọc được giới hạn từ cấu hình {@code legacyvault.asset.max-payload-bytes} (mặc định 65536), không hardcode.
 */
public class PayloadSizeValidator implements ConstraintValidator<PayloadSize, String> {

	/**
	 * Số byte UTF-8 tối đa cho phép.
	 */
	private final int maxBytes;

	/**
	 * Khởi tạo với giới hạn byte từ cấu hình.
	 *
	 * @param maxBytes giá trị {@code legacyvault.asset.max-payload-bytes}
	 */
	public PayloadSizeValidator(@Value("${legacyvault.asset.max-payload-bytes:65536}") int maxBytes) {
		this.maxBytes = maxBytes;
	}

	/**
	 * Kiểm tra chuỗi hợp lệ khi null hoặc độ dài UTF-8 không quá giới hạn.
	 *
	 * @param value payload cần kiểm tra
	 * @param context ngữ cảnh validation
	 * @return true nếu hợp lệ
	 */
	@Override
	public boolean isValid(String value, ConstraintValidatorContext context) {
		return value == null || value.getBytes(StandardCharsets.UTF_8).length <= maxBytes;
	}
}
