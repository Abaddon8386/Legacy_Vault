package com.legacyvault.common.support;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.context.MessageSourceAutoConfiguration;
import org.springframework.context.annotation.Import;

import com.legacyvault.common.error.ApiErrorFactory;
import com.legacyvault.common.error.ApiErrorWriter;
import com.legacyvault.common.i18n.I18nConfig;
import com.legacyvault.common.i18n.MessageService;
import com.legacyvault.common.security.ApiAccessDeniedHandler;
import com.legacyvault.common.security.ApiAuthenticationEntryPoint;
import com.legacyvault.common.security.SecurityConfig;
import com.legacyvault.common.web.TraceIdFilter;

/** Gom các bean dùng chung mà @WebMvcTest không tự quét (chỉ quét controller/advice/filter). */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@ImportAutoConfiguration(MessageSourceAutoConfiguration.class)
@Import({ SecurityConfig.class, ApiAuthenticationEntryPoint.class, ApiAccessDeniedHandler.class,
		ApiErrorFactory.class, ApiErrorWriter.class, MessageService.class, I18nConfig.class,
		TraceIdFilter.class })
public @interface WebContractTestConfig {
}
