package com.legacyvault.common.api;

import java.util.List;

public record PageEnvelope<T>(List<T> content, int page, int size, long totalElements, int totalPages) {
	public PageEnvelope {
		content = List.copyOf(content);
	}
}
