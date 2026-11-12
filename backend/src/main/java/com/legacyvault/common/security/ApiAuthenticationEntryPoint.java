package com.legacyvault.common.security;

import java.io.IOException;

import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import com.legacyvault.common.error.ApiErrorWriter;
import com.legacyvault.common.error.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 401: chưa đăng nhập / token thiếu hoặc không hợp lệ -> JSON lỗi chung ({@code UNAUTHENTICATED}). Được đăng ký
 * trong {@link SecurityConfig} và được {@link JwtAuthenticationFilter} gọi khi token bị từ chối.
 */
@Component
public class ApiAuthenticationEntryPoint implements AuthenticationEntryPoint {

	private final ApiErrorWriter writer;

	/** Nhận {@link ApiErrorWriter} để ghi JSON lỗi. */
	public ApiAuthenticationEntryPoint(ApiErrorWriter writer) {
		this.writer = writer;
	}

	/** Ghi phản hồi 401 {@code UNAUTHENTICATED} khi request cần xác thực nhưng chưa có hoặc sai thông tin. */
	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException authException) throws IOException {
		writer.write(request, response, ErrorCode.UNAUTHENTICATED);
	}
}
