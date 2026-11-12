package com.legacyvault.common.error;

/**
 * Lỗi nghiệp vụ có kiểu. Service ném exception này (hoặc lớp con), GlobalExceptionHandler đổi thành
 * JSON lỗi chung. Tham số {@code args} chỉ dùng để điền vào message vi/en ({0}, {1}...).
 *
 * <p>Không đưa dữ liệu nhạy cảm (mật khẩu, token, nội dung tài sản) vào args.
 *
 * <p>HTTP status và message key do {@link ErrorCode} quyết định; exception được xử lý ở
 * {@link GlobalExceptionHandler#handleBusiness}.
 */
public class BusinessException extends RuntimeException {
	private final ErrorCode errorCode;
	private final transient Object[] args;

	/**
	 * @param errorCode mã lỗi công khai (bắt buộc)
	 * @param args      tham số điền vào thông điệp, có thể rỗng
	 */
	public BusinessException(ErrorCode errorCode, Object... args) {
		super(errorCode.name());
		this.errorCode = errorCode;
		this.args = args;
	}

	/** Trả về mã lỗi nghiệp vụ. */
	public ErrorCode getErrorCode() {
		return errorCode;
	}
	/** Trả về tham số điền vào thông điệp lỗi. */
	public Object[] getArgs() {
		return args;
	}
}
