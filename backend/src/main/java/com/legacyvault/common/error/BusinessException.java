package com.legacyvault.common.error;

/**
 * Lỗi nghiệp vụ có kiểu. Service ném exception này (hoặc lớp con), GlobalExceptionHandler đổi thành
 * JSON lỗi chung. Tham số {@code args} chỉ dùng để điền vào message vi/en ({0}, {1}...).
 *
 * <p>Không đưa dữ liệu nhạy cảm (mật khẩu, token, nội dung tài sản) vào args.
 */
public class BusinessException extends RuntimeException {
	private final ErrorCode errorCode;
	private final transient Object[] args;

	public BusinessException(ErrorCode errorCode, Object... args) {
		super(errorCode.name());
		this.errorCode = errorCode;
		this.args = args;
	}

	public ErrorCode getErrorCode() {
		return errorCode;
	}
	public Object[] getArgs() {
		return args;
	}
}
