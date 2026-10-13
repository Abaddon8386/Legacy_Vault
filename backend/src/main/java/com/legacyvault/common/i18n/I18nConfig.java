package com.legacyvault.common.i18n;

import java.util.List;
import java.util.Locale;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

@Configuration
public class I18nConfig {

	public static final Locale VIETNAMESE = Locale.forLanguageTag("vi");
	public static final Locale ENGLISH = Locale.ENGLISH;

	/** Chỉ hỗ trợ vi/en, mặc định vi. Bean phải tên "localeResolver" để DispatcherServlet dùng. */
	@Bean
	public LocaleResolver localeResolver() {
		AcceptHeaderLocaleResolver resolver = new AcceptHeaderLocaleResolver();
		resolver.setSupportedLocales(List.of(VIETNAMESE, ENGLISH));
		resolver.setDefaultLocale(VIETNAMESE);
		return resolver;
	}
}
