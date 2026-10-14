package com.legacyvault.common.error;

/**
 * Danh mục mã lỗi công khai. {@code name()} là giá trị "code" trong JSON lỗi và là thứ duy nhất
 * FE được phép dùng để phân loại lỗi (không so sánh chuỗi message).
 *
 * <p>Thêm mã mới: thêm một dòng ở đây, thêm message key vi/en vào messages*.properties và cập nhật
 * docs/api-contracts/error-contract.md trong cùng PR.
 */
public enum ErrorCode {
	VALIDATION_FAILED(400, "error.validation.failed"),
	MALFORMED_REQUEST(400, "error.request.malformed"),
	UNAUTHENTICATED(401, "error.auth.unauthenticated"),
	INVALID_CREDENTIALS(401, "error.auth.invalidCredentials"),
	ACCESS_DENIED(403, "error.auth.accessDenied"),
	REAUTH_FAILED(403, "error.auth.reauthFailed"),
	RESOURCE_NOT_FOUND(404, "error.resource.notFound"),
	METHOD_NOT_ALLOWED(405, "error.request.methodNotAllowed"),
	EMAIL_ALREADY_EXISTS(409, "error.auth.emailExists"),
	VAULT_ALREADY_EXISTS(409, "error.vault.alreadyExists"),
	TRUSTEE_ALREADY_EXISTS(409, "error.trustee.alreadyExists"),
	VAULT_NOT_EDITABLE(409, "error.vault.notEditable"),
	PAYLOAD_TOO_LARGE(413, "error.request.payloadTooLarge"),
	UNSUPPORTED_MEDIA_TYPE(415, "error.request.unsupportedMediaType"),
	TOO_MANY_ATTEMPTS(429, "error.auth.tooManyAttempts"),
	INTERNAL_ERROR(500, "error.internal");

	private final int status;
	private final String messageKey;

	ErrorCode(int status, String messageKey) {
		this.status = status;
		this.messageKey = messageKey;
	}

	public int status() {
		return status;
	}
	public String messageKey() {
		return messageKey;
	}
}
