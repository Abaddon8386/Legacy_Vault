package com.legacyvault.common.error;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.servlet.LocaleResolver;

import com.legacyvault.common.i18n.MessageService;
import com.legacyvault.common.web.TraceIdFilter;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Dựng {@link ApiError} từ {@link ErrorCode}; nơi duy nhất quyết định nội dung JSON lỗi. Dùng bởi
 * {@link GlobalExceptionHandler} và {@link ApiErrorWriter}. Thông điệp được dịch qua
 * {@link MessageService} theo locale của request (Accept-Language), traceId lấy từ MDC do
 * {@code TraceIdFilter} đặt.
 */
@Component
public class ApiErrorFactory {

	private static final String VALIDATION_KEY_PREFIX = "validation.";

	private final MessageService messages;
	private final LocaleResolver localeResolver;

	/** Nhận {@link MessageService} để dịch thông điệp và {@link LocaleResolver} để xác định ngôn ngữ request. */
	public ApiErrorFactory(MessageService messages, LocaleResolver localeResolver) {
		this.messages = messages;
		this.localeResolver = localeResolver;
	}

	/**
	 * Tạo {@link ApiError} cho một mã lỗi.
	 *
	 * @param request request hiện tại (lấy URI và locale)
	 * @param code    mã lỗi (quyết định status, code, messageKey)
	 * @param items   danh sách lỗi theo trường (rỗng nếu không có)
	 * @param args    tham số điền vào thông điệp ({0}, {1}...)
	 * @return đối tượng lỗi hoàn chỉnh
	 */
	public ApiError create(HttpServletRequest request, ErrorCode code, List<ApiError.FieldItem> items, Object... args) {
		Locale locale = localeResolver.resolveLocale(request);
		return new ApiError(Instant.now().toString(), code.status(), code.name(), code.messageKey(),
				messages.get(locale, code.messageKey(), args), request.getRequestURI(), currentTraceId(), items);
	}

	/**
	 * Đổi lỗi Bean Validation thành danh sách lỗi theo trường. "code" là tên ràng buộc dạng UPPER_SNAKE
	 * (NotBlank -> NOT_BLANK); messageKey mặc định "validation.&lt;TênRàngBuộc&gt;". DTO có thể ghi đè
	 * bằng {@code message = "validation.xxx"} cho ràng buộc riêng.
	 *
	 * <p>Kết quả luôn mang {@link ErrorCode#VALIDATION_FAILED} (HTTP 400).
	 *
	 * @param request       request hiện tại
	 * @param bindingResult kết quả binding/validation của Spring
	 * @return {@link ApiError} có danh sách {@code errors}
	 */
	public ApiError validation(HttpServletRequest request, BindingResult bindingResult) {
		Locale locale = localeResolver.resolveLocale(request);
		List<ApiError.FieldItem> items = bindingResult.getAllErrors().stream()
				.map(error -> toItem(locale, error))
				.toList();
		return create(request, ErrorCode.VALIDATION_FAILED, items);
	}

	/** Đổi một {@link ObjectError} của Spring thành {@link ApiError.FieldItem} (xác định field, code, messageKey, message). */
	private ApiError.FieldItem toItem(Locale locale, ObjectError error) {
		String field = error instanceof FieldError fieldError ? fieldError.getField() : "";
		String rawCode = error.getCode() == null ? "invalid" : error.getCode();
		String defaultMessage = error.getDefaultMessage();
		String key = defaultMessage != null && defaultMessage.startsWith(VALIDATION_KEY_PREFIX)
				? defaultMessage
				: VALIDATION_KEY_PREFIX + rawCode;
		return new ApiError.FieldItem(field, toUpperSnake(rawCode), key, messages.get(locale, key));
	}

	/** Đổi camelCase sang UPPER_SNAKE, ví dụ {@code NotBlank} thành {@code NOT_BLANK}. */
	static String toUpperSnake(String value) {
		return value.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toUpperCase(Locale.ROOT);
	}

	/** Lấy traceId từ MDC; nếu không có (ngoài request) thì sinh UUID mới. */
	private String currentTraceId() {
		String traceId = MDC.get(TraceIdFilter.MDC_KEY);
		return traceId != null ? traceId : UUID.randomUUID().toString();
	}
}
