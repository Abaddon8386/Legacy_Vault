package com.legacyvault.common.web;

import java.util.List;
import java.util.function.Function;

import org.springframework.data.domain.Page;

/** Envelope phân trang chung (D-API-06): content/page/size/totalElements/totalPages. */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

	public static <E, T> PageResponse<T> from(Page<E> page, Function<E, T> mapper) {
		return new PageResponse<>(page.getContent().stream().map(mapper).toList(), page.getNumber(), page.getSize(),
				page.getTotalElements(), page.getTotalPages());
	}
}
