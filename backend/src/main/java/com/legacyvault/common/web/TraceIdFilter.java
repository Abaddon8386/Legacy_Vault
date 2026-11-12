package com.legacyvault.common.web;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Gán mã truy vết (traceId) cho mỗi request: đưa vào MDC (xuất hiện trong log) và header X-Trace-Id.
 * Chạy trước Spring Security nên 401/403 cũng có traceId. Không tin traceId do client gửi.
 * TraceId được {@code ApiErrorFactory} đưa vào JSON lỗi và {@code AuditService} lưu vào {@code audit_logs.trace_id}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

	/** Khóa của traceId trong MDC. */
	public static final String MDC_KEY = "traceId";
	/** Tên header phản hồi chứa traceId. */
	public static final String HEADER = "X-Trace-Id";

	/**
	 * Sinh UUID mới làm traceId, đặt vào MDC và header phản hồi, chạy phần còn lại của chuỗi filter và luôn xóa
	 * MDC khi kết thúc request.
	 */
	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String traceId = UUID.randomUUID().toString();
		MDC.put(MDC_KEY, traceId);
		response.setHeader(HEADER, traceId);
		try {
			chain.doFilter(request, response);
		}
		finally {
			MDC.remove(MDC_KEY);
		}
	}
}
