package com.legacyvault.common.security;

import java.io.IOException;

import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import com.legacyvault.common.error.ApiErrorWriter;
import com.legacyvault.common.error.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** 401: chưa đăng nhập / token thiếu hoặc không hợp lệ -> JSON lỗi chung. */
@Component
public class ApiAuthenticationEntryPoint implements AuthenticationEntryPoint {

	private final ApiErrorWriter writer;

	public ApiAuthenticationEntryPoint(ApiErrorWriter writer) {
		this.writer = writer;
	}

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException authException) throws IOException {
		writer.write(request, response, ErrorCode.UNAUTHENTICATED);
	}
}
