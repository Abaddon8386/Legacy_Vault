package com.legacyvault.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.audit.AuditLogRepository;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.will.repository.AssetVersionRepository;
import com.legacyvault.will.repository.LegalDocumentRepository;
import com.legacyvault.will.repository.WillAssetRepository;

import jakarta.persistence.EntityManagerFactory;

/**
 * Dựng Hibernate với dialect SQL Server nhưng <b>không kết nối DB</b>: chứng minh entity ánh xạ được và mọi
 * câu {@code @Query}/tên hàm repository hợp lệ (Spring Data kiểm tra khi khởi tạo repository).
 *
 * <p>Không thay cho test với SQL Server thật: tên bảng/cột và kiểu dữ liệu chỉ được kiểm khi chạy với DB đã migrate.
 */
@DataJpaTest(properties = {
		"spring.jpa.database-platform=org.hibernate.dialect.SQLServerDialect",
		"spring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false",
		"spring.datasource.url=jdbc:sqlserver://localhost:1;databaseName=not-used",
		"spring.datasource.hikari.initialization-fail-timeout=-1",
		"spring.sql.init.mode=never",
		"spring.flyway.enabled=false" })
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED) // không mở giao dịch = không cần kết nối DB
class JpaMappingTest {

	@Autowired
	private EntityManagerFactory entityManagerFactory;

	@Autowired
	private VaultRepository vaultRepository;

	@Autowired
	private AssetRepository assetRepository;

	@Autowired
	private WillAssetRepository willAssetRepository;

	@Autowired
	private AssetVersionRepository assetVersionRepository;

	@Autowired
	private LegalDocumentRepository legalDocumentRepository;

	@Autowired
	private AuditLogRepository auditLogRepository;

	@Test
	void entitiesAndRepositoryQueriesAreValid() {
		assertThat(entityManagerFactory.getMetamodel().getEntities())
				.extracting(entity -> entity.getName())
				.contains("User", "Role", "UserRole", "Vault", "Asset", "AssetVersion", "LegalDocument", "AuditLog");
		assertThat(vaultRepository).isNotNull();
		assertThat(assetRepository).isNotNull();
		assertThat(willAssetRepository).isNotNull();
		assertThat(assetVersionRepository).isNotNull();
		assertThat(legalDocumentRepository).isNotNull();
		assertThat(auditLogRepository).isNotNull();
	}
}
