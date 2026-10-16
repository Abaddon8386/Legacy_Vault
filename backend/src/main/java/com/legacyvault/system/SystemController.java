package com.legacyvault.system;

import java.time.Instant;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Smoke test ứng dụng. Công khai nhưng tối giản: không phiên bản thư viện, không thông tin hạ tầng/DB. */
@RestController
@RequestMapping("/api/v1/system")
public class SystemController {

	public record PingResponse(String status, String service, String time) {
	}

	@GetMapping("/ping")
	public PingResponse ping() {
		return new PingResponse("UP", "legacyvault-backend", Instant.now().toString());
	}
}
