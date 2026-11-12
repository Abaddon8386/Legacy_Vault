package com.legacyvault.common.i18n;

import java.util.List;
import java.util.Locale;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

/**
 * Cấu hình đa ngôn ngữ: hỗ trợ tiếng Việt (mặc định) và tiếng Anh, xác định từ header
 * {@code Accept-Language}. Locale này được {@code ApiErrorFactory} / {@code MessageService} dùng để dịch thông
 * điệp lỗi.
 */
@Configuration
public class I18nConfig {

	/** Locale tiếng Việt (ngôn ngữ mặc định). */
	public static final Locale VIETNAMESE = Locale.forLanguageTag("vi");
	/** Locale tiếng Anh. */
	public static final Locale ENGLISH = Locale.ENGLISH;

	/**
	 * Chỉ hỗ trợ vi/en, mặc định vi. Bean phải tên "localeResolver" để DispatcherServlet dùng.
	 *
	 * @return bộ phân giải locale đọc từ header {@code Accept-Language}
	 */
	@Bean
	public LocaleResolver localeResolver() {
		AcceptHeaderLocaleResolver resolver = new AcceptHeaderLocaleResolver();
		resolver.setSupportedLocales(List.of(VIETNAMESE, ENGLISH));
		resolver.setDefaultLocale(VIETNAMESE);
		return resolver;
	}
}
