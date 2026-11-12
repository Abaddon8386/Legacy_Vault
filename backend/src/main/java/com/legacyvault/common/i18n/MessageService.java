package com.legacyvault.common.i18n;

import java.util.Locale;

import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.stereotype.Service;

/**
 * Lấy thông điệp vi/en theo message key. Quy tắc fallback (xem docs/api-contracts/conventions.md):
 * locale lấy từ Accept-Language; không có hoặc không hỗ trợ -> "vi"; thiếu key -> trả chính key.
 * Được {@code ApiErrorFactory} gọi để dịch thông điệp lỗi từ {@code messages.properties}/{@code messages_en.properties}.
 */
@Service
public class MessageService {
	private final MessageSource messageSource;
	/** Nhận {@link MessageSource} của Spring chứa các file messages. */
	public MessageService(MessageSource messageSource) {
		this.messageSource = messageSource;
	}

	/**
	 * Dùng trong luồng request thông thường (locale lấy từ LocaleContextHolder).
	 *
	 * @param key  khóa thông điệp
	 * @param args tham số điền vào thông điệp
	 * @return thông điệp đã dịch, hoặc chính key nếu thiếu
	 */
	public String get(String key, Object... args) {
		return get(LocaleContextHolder.getLocale(), key, args);
	}

	/**
	 * Dùng khi cần chỉ định locale rõ ràng (ví dụ handler của Spring Security, chạy trước DispatcherServlet).
	 *
	 * @param locale ngôn ngữ cần dịch
	 * @param key    khóa thông điệp
	 * @param args   tham số điền vào thông điệp
	 * @return thông điệp đã dịch, hoặc chính key nếu thiếu
	 */
	public String get(Locale locale, String key, Object... args) {
		return messageSource.getMessage(key, args, key, locale);
	}
}
