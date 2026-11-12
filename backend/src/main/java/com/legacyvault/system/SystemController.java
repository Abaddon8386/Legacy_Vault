package com.legacyvault.system;

import java.time.Instant;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Smoke test ứng dụng. Công khai nhưng tối giản: không phiên bản thư viện, không thông tin hạ tầng/DB.
 * <p>
 * API: {@code GET /api/v1/system/ping}. Dùng để kiểm tra nhanh backend đã chạy (health check đơn giản cho CI/deploy).
 */
@RestController
@RequestMapping("/api/v1/system")
public class SystemController {

	/**
	 * Phản hồi của {@link #ping()}.
	 * @param status  luôn là {@code "UP"}
	 * @param service tên dịch vụ cố định {@code "legacyvault-backend"}
	 * @param time    thời điểm server xử lý, định dạng ISO-8601 (UTC) từ {@link Instant#toString()}
	 */
	public record PingResponse(String status, String service, String time) {
	}

	/**
	 * {@code GET /api/v1/system/ping}: trả {@link PingResponse} gồm trạng thái UP, tên dịch vụ và thời gian hiện tại của server.
	 * Không đọc DB, không ném lỗi nghiệp vụ.
	 * @return phản hồi ping
	 */
	@GetMapping("/ping")
	public PingResponse ping() {
		return new PingResponse("UP", "legacyvault-backend", Instant.now().toString());
	}
}
