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
 * <p>
 * API: {@code GET /api/v1/system/db-check} (xem {@link #dbCheck()}), không yêu cầu quyền đặc biệt ngoài cấu hình bảo mật
 * chung. Dùng {@link JdbcTemplate} chạy {@code SELECT 1} nên không đụng tới bảng nghiệp vụ nào.
 */
@RestController
@RequestMapping("/api/v1/system")
@Profile("dev")
public class DbCheckController {

	private static final Logger log = LoggerFactory.getLogger(DbCheckController.class);

	/**
	 * Kết quả kiểm tra DB trả về cho client.
	 * @param database {@code "UP"} nếu truy vấn thành công, {@code "DOWN"} nếu có lỗi
	 */
	public record DbCheckResponse(String database) {
	}

	/**
	 * Truy cập JDBC thuần để chạy câu lệnh kiểm tra kết nối.
	 */
	private final JdbcTemplate jdbcTemplate;

	/**
	 * Khởi tạo controller với {@link JdbcTemplate} do Spring tiêm vào.
	 * @param jdbcTemplate đối tượng JDBC dùng chạy {@code SELECT 1}
	 */
	public DbCheckController(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	/**
	 * {@code GET /api/v1/system/db-check} (chỉ profile dev): chạy {@code SELECT 1} để xác nhận SQL Server còn sống.
	 * <p>
	 * Thành công trả {@code DbCheckResponse("UP")}; mọi ngoại lệ được bắt, chỉ ghi log tên lớp ngoại lệ (không ghi message vì có
	 * thể lộ host/database/user) rồi trả {@code DbCheckResponse("DOWN")}. Không ném {@code BusinessException}.
	 * @return {@link DbCheckResponse} với trạng thái UP hoặc DOWN
	 */
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
