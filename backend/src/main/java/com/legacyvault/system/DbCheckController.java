package com.legacyvault.system;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Kiểm tra kết nối SQL Server bằng truy vấn chỉ đọc. Chỉ tồn tại khi chạy profile "dev"
 * (profile khác: bean không được tạo -> 404). Kết quả chỉ UP/DOWN, không bao giờ trả thông báo lỗi SQL.
 */
@RestController
@RequestMapping("/api/v1/system")
@Profile("dev")
public class DbCheckController {

	private static final Logger log = LoggerFactory.getLogger(DbCheckController.class);

	public record DbCheckResponse(String database) {
	}

	private final JdbcTemplate jdbcTemplate;

	public DbCheckController(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	@GetMapping("/db-check")
	public DbCheckResponse dbCheck() {
		try {
			jdbcTemplate.queryForObject("SELECT 1", Integer.class);
			return new DbCheckResponse("UP");
		}
		catch (Exception ex) {
			// Chỉ ghi loại lỗi; không ghi message (có thể chứa host/database/user).
			log.warn("Database check failed: {}", ex.getClass().getSimpleName());
			return new DbCheckResponse("DOWN");
		}
	}
}
