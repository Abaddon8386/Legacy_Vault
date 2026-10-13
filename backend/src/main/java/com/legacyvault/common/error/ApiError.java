package com.legacyvault.common.error;

import java.util.List;

/**
 * Hình dạng JSON lỗi dùng chung cho mọi phản hồi lỗi (kể cả 401/403 do Spring Security).
 * Không chứa stack trace, SQL, tên schema hay secret.
 */
public record ApiError(
		String timestamp,
		int status,
		String code,
		String messageKey,
		String message,
		String path,
		String traceId,
		List<FieldItem> errors) {

	public record FieldItem(String field, String code, String messageKey, String message) {
	}
}
