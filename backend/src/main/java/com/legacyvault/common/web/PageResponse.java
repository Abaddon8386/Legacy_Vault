package com.legacyvault.common.web;

import java.util.List;
import java.util.function.Function;

import org.springframework.data.domain.Page;

/**
 * Envelope phân trang chung (D-API-06): content/page/size/totalElements/totalPages. Trả ra từ các API danh sách.
 *
 * <ul>
 *   <li>{@code content}: các phần tử của trang hiện tại;</li>
 *   <li>{@code page}: số trang, bắt đầu từ 0;</li>
 *   <li>{@code size}: kích thước trang;</li>
 *   <li>{@code totalElements}: tổng số phần tử;</li>
 *   <li>{@code totalPages}: tổng số trang.</li>
 * </ul>
 */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

	/**
	 * Chuyển {@link Page} của Spring Data thành {@link PageResponse}, ánh xạ từng phần tử bằng {@code mapper}.
	 *
	 * @param page   trang kết quả từ repository
	 * @param mapper hàm đổi entity sang DTO
	 * @return envelope phân trang
	 */
	public static <E, T> PageResponse<T> from(Page<E> page, Function<E, T> mapper) {
		return new PageResponse<>(page.getContent().stream().map(mapper).toList(), page.getNumber(), page.getSize(),
				page.getTotalElements(), page.getTotalPages());
	}
}
