package com.legacyvault.common.api;

import java.util.List;

/**
 * Phong bì phân trang chung cho các API danh sách (cùng hình dạng với {@code PageResponse}).
 *
 * <ul>
 *   <li>{@code content}: các phần tử của trang hiện tại (được sao chép bất biến);</li>
 *   <li>{@code page}: số thứ tự trang, bắt đầu từ 0;</li>
 *   <li>{@code size}: kích thước trang yêu cầu;</li>
 *   <li>{@code totalElements}: tổng số phần tử;</li>
 *   <li>{@code totalPages}: tổng số trang.</li>
 * </ul>
 */
public record PageEnvelope<T>(List<T> content, int page, int size, long totalElements, int totalPages) {
	/** Sao chép {@code content} thành danh sách bất biến. */
	public PageEnvelope {
		content = List.copyOf(content);
	}
}
