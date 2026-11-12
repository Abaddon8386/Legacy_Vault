package com.legacyvault.common.error;

import java.util.List;

/**
 * Hình dạng JSON lỗi dùng chung cho mọi phản hồi lỗi (kể cả 401/403 do Spring Security).
 * Không chứa stack trace, SQL, tên schema hay secret. Được dựng bởi {@link ApiErrorFactory}, trả ra bởi
 * {@link GlobalExceptionHandler} (lỗi trong controller) hoặc {@link ApiErrorWriter} (lỗi ở tầng filter).
 *
 * <ul>
 *   <li>{@code timestamp}: thời điểm lỗi, định dạng ISO-8601 (UTC);</li>
 *   <li>{@code status}: mã HTTP;</li>
 *   <li>{@code code}: tên {@link ErrorCode}, là thứ duy nhất frontend dùng để phân loại lỗi;</li>
 *   <li>{@code messageKey}: khóa thông điệp trong {@code messages*.properties};</li>
 *   <li>{@code message}: thông điệp đã dịch theo ngôn ngữ của request (vi/en);</li>
 *   <li>{@code path}: đường dẫn request gây lỗi;</li>
 *   <li>{@code traceId}: mã truy vết (khớp header {@code X-Trace-Id} và log server);</li>
 *   <li>{@code errors}: danh sách lỗi theo từng trường (chỉ có khi validation thất bại, ngược lại rỗng).</li>
 * </ul>
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

	/**
	 * Một lỗi validation của một trường.
	 *
	 * <ul>
	 *   <li>{@code field}: tên trường trong request (rỗng nếu lỗi cấp object);</li>
	 *   <li>{@code code}: tên ràng buộc dạng UPPER_SNAKE (ví dụ {@code NOT_BLANK});</li>
	 *   <li>{@code messageKey}: khóa thông điệp, mặc định {@code validation.<TênRàngBuộc>};</li>
	 *   <li>{@code message}: thông điệp đã dịch.</li>
	 * </ul>
	 */
	public record FieldItem(String field, String code, String messageKey, String message) {
	}
}
