package com.legacyvault.common.error;

import java.io.IOException;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

/**
 * Ghi JSON lỗi trực tiếp vào response. Dùng ở tầng Servlet filter (Spring Security 401/403), nơi
 * {@code @RestControllerAdvice} không với tới được.
 */
@Component
public class ApiErrorWriter {

	private final ApiErrorFactory factory;
	private final ObjectMapper objectMapper;

	public ApiErrorWriter(ApiErrorFactory factory, ObjectMapper objectMapper) {
		this.factory = factory;
		this.objectMapper = objectMapper;
	}

	public void write(HttpServletRequest request, HttpServletResponse response, ErrorCode code) throws IOException {
		ApiError body = factory.create(request, code, List.of());
		response.setStatus(code.status());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		objectMapper.writeValue(response.getOutputStream(), body);
	}
}
