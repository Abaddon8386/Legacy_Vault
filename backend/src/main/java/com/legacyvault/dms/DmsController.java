package com.legacyvault.dms;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

/**
 * REST controller công tắc người chết (DMS) cho chủ két. Toàn bộ endpoint dưới {@code /api/v1/dms} yêu cầu
 * quyền {@code ROLE_VAULT_OWNER} (cả {@code @PreAuthorize} lẫn {@code SecurityConfig}). Logic ở {@link DmsService}.
 *
 * <ul>
 *   <li>{@code PUT /api/v1/dms}: cấu hình chu kỳ check-in và gia hạn;</li>
 *   <li>{@code GET /api/v1/dms}: xem cấu hình hiện tại;</li>
 *   <li>{@code POST /api/v1/dms/check-in}: chủ két xác nhận còn sống.</li>
 * </ul>
 */
@Validated
@RestController
@RequestMapping("/api/v1/dms")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class DmsController {

	private final DmsService service;

	/** Nhận {@link DmsService} xử lý nghiệp vụ. */
	public DmsController(DmsService service) {
		this.service = service;
	}

	/**
	 * {@code PUT /api/v1/dms} - tạo hoặc cập nhật cấu hình DMS của chủ két đang đăng nhập (ST-06).
	 *
	 * @param request {@link DmsDtos.ConfigureRequest}: chu kỳ check-in (ngày hoặc phút) và gia hạn tùy chọn
	 * @return {@link DmsDtos.Response} cấu hình sau khi lưu
	 * @throws com.legacyvault.common.error.BusinessException xem {@link DmsService#configure}
	 */
	@PutMapping
	public DmsDtos.Response configure(@Valid @RequestBody DmsDtos.ConfigureRequest request) {
		return service.configure(request);
	}

	/**
	 * {@code GET /api/v1/dms} - lấy cấu hình DMS hiện tại của chủ két.
	 *
	 * @return {@link DmsDtos.Response}; lỗi 404 {@code RESOURCE_NOT_FOUND} nếu chưa cấu hình
	 */
	@GetMapping
	public DmsDtos.Response get() {
		return service.get();
	}

	/**
	 * {@code POST /api/v1/dms/check-in} - chủ két check-in để dời hạn kế tiếp (hoặc hủy cảnh báo trong thời gian gia hạn).
	 *
	 * @return {@link DmsDtos.Response} cấu hình sau khi check-in
	 */
	@PostMapping("/check-in")
	public DmsDtos.Response checkIn() {
		return service.checkIn();
	}
}
