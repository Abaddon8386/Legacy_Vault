package com.legacyvault.common.security;

import java.io.IOException;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import com.legacyvault.common.error.ApiErrorWriter;
import com.legacyvault.common.error.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** 403: đã đăng nhập nhưng thiếu quyền -> JSON lỗi chung. */
@Component
public class ApiAccessDeniedHandler implements AccessDeniedHandler {

	private final ApiErrorWriter writer;

	public ApiAccessDeniedHandler(ApiErrorWriter writer) {
		this.writer = writer;
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response,
			AccessDeniedException accessDeniedException) throws IOException {
		writer.write(request, response, ErrorCode.ACCESS_DENIED);
	}
}
