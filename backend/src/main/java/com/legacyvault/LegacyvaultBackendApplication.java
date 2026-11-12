package com.legacyvault;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Điểm khởi động của backend LegacyVault (Spring Boot).
 * <p>
 * {@code @SpringBootApplication} bật cấu hình tự động, quét component trong gói {@code com.legacyvault} và các gói con
 * (auth, admin, vault, asset, will, beneficiary, verification, handover, subscription, dms, audit, common, ...).
 * Khi khởi động, Flyway chạy các migration trong {@code database/migration} trước khi JPA làm việc với SQL Server.
 */
@SpringBootApplication
public class LegacyvaultBackendApplication {

	/**
	 * Hàm main của ứng dụng: gọi {@link SpringApplication#run(Class, String...)} để khởi tạo ApplicationContext và nhúng
	 * web server.
	 * @param args tham số dòng lệnh truyền vào JVM (không dùng riêng cho nghiệp vụ nào)
	 */
	public static void main(String[] args) {
		SpringApplication.run(LegacyvaultBackendApplication.class, args);
	}

}
