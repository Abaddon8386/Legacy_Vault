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
 * {@code @RestControllerAdvice} không với tới được. Được {@link com.legacyvault.common.security.ApiAuthenticationEntryPoint}
 * và {@link com.legacyvault.common.security.ApiAccessDeniedHandler} gọi.
 */
@Component
public class ApiErrorWriter {

	private final ApiErrorFactory factory;
	private final ObjectMapper objectMapper;

	/** Nhận {@link ApiErrorFactory} để dựng lỗi và ObjectMapper (Jackson 3) để ghi JSON. */
	public ApiErrorWriter(ApiErrorFactory factory, ObjectMapper objectMapper) {
		this.factory = factory;
		this.objectMapper = objectMapper;
	}

	/**
	 * Ghi lỗi dạng JSON UTF-8 vào response với HTTP status của mã lỗi.
	 *
	 * @param request  request hiện tại
	 * @param response response cần ghi
	 * @param code     mã lỗi cần trả
	 * @throws IOException nếu ghi vào output stream thất bại
	 */
	public void write(HttpServletRequest request, HttpServletResponse response, ErrorCode code) throws IOException {
		ApiError body = factory.create(request, code, List.of());
		response.setStatus(code.status());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		objectMapper.writeValue(response.getOutputStream(), body);
	}
}
