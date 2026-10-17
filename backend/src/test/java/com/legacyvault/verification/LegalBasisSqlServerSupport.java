package com.legacyvault.verification;

import com.legacyvault.LegacyvaultBackendApplication;
import com.legacyvault.common.security.CustomUserPrincipal;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.config.TaskManagementConfigUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.DriverManager;
import java.util.Base64;
import java.util.UUID;

/** Creates and removes only a randomly named disposable DB; never migrates the supplied master DB. */
@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
abstract class LegalBasisSqlServerSupport {
    static ConfigurableApplicationContext context;
    static JdbcTemplate jdbc;
    static TransactionTemplate tx;
    static EntityManager entities;
    private static String database;
    private static String masterUrl;
    static final String HASH = "a".repeat(64);

    @BeforeAll
    static void startDatabase() throws Exception {
        masterUrl = System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        database = "LegacyVault_LegalTest_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(masterUrl); var statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE [" + database + "]");
        }
        String key = Base64.getEncoder().encodeToString(new byte[32]);
        try {
            context = new SpringApplicationBuilder(LegacyvaultBackendApplication.class)
                    .initializers(application -> application.addBeanFactoryPostProcessor(factory -> {
                        var registry = (BeanDefinitionRegistry) factory;
                        String name = TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME;
                        if (registry.containsBeanDefinition(name)) registry.removeBeanDefinition(name);
                    })).run("--spring.datasource.url=" + masterUrl.replace("databaseName=master;", "databaseName=" + database + ";"),
                            "--server.port=0", "--legacyvault.jwt.secret=" + key, "--legacyvault.encryption.key=" + key,
                            "--logging.level.root=ERROR", "--logging.level.org.springframework.security=ERROR",
                            "--logging.level.org.flywaydb=ERROR");
            jdbc = context.getBean(JdbcTemplate.class);
            tx = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
            tx.setTimeout(20);
            entities = context.getBean(EntityManager.class);
        } catch (Throwable failure) {
            stopDatabase();
            throw failure;
        }
    }

    @AfterAll
    static void stopDatabase() throws Exception {
        if (context != null) { context.close(); context = null; }
        if (database == null) return;
        if (!database.matches("LegacyVault_LegalTest_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe test database name");
        try (var connection = DriverManager.getConnection(masterUrl); var statement = connection.createStatement()) {
            statement.execute("ALTER DATABASE [" + database + "] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");
            statement.execute("DROP DATABASE [" + database + "]");
        } finally { database = null; }
    }

    static Fixture fixture(boolean match) {
        UUID userPublic = UUID.randomUUID();
        long userId = jdbc.queryForObject("INSERT dbo.users (public_id, full_name, email, password_hash, status) OUTPUT inserted.user_id VALUES (?, 'Legal fixture', ?, 'unused', 'ACTIVE')",
                Long.class, userPublic.toString(), userPublic + "@example.test");
        long vaultId = jdbc.queryForObject("INSERT dbo.vaults (owner_user_id, vault_name, status) OUTPUT inserted.vault_id VALUES (?, 'Legal fixture', 'WILL_VERIFICATION')", Long.class, userId);
        UUID casePublic = UUID.randomUUID();
        long caseId = jdbc.queryForObject("INSERT dbo.verification_cases (public_id, vault_id, triggered_at, assigned_staff_user_id) OUTPUT inserted.verification_case_id VALUES (?, ?, SYSUTCDATETIME(), ?)", Long.class, casePublic.toString(), vaultId, userId);
        if (match) {
            long assetId = jdbc.queryForObject("INSERT dbo.assets (vault_id, asset_type, title) OUTPUT inserted.asset_id VALUES (?, 'DOCUMENT', 'Fixture will')", Long.class, vaultId);
            long versionId = jdbc.queryForObject("INSERT dbo.asset_versions (asset_id, version_no, original_file_name, content_type, file_size_bytes, sha256_hash, encrypted_file_content, encryption_iv, encryption_key_version, uploaded_by_user_id) OUTPUT inserted.asset_version_id VALUES (?, 1, 'fixture.pdf', 'application/pdf', 1, ?, 0x01, 0x000000000000000000000000, 'test', ?)", Long.class, assetId, HASH, userId);
            long intakeId = jdbc.queryForObject("INSERT dbo.original_will_intakes (verification_case_id, delivered_by_name, received_by_user_id) OUTPUT inserted.original_will_intake_id VALUES (?, 'Fixture', ?)", Long.class, caseId, userId);
            jdbc.update("INSERT dbo.will_comparisons (verification_case_id, original_will_intake_id, asset_version_id, referenced_sha256_hash, comparison_result, checked_by_user_id) VALUES (?, ?, ?, ?, 'MATCH', ?)", caseId, intakeId, versionId, HASH, userId);
        }
        return new Fixture(userId, vaultId, caseId, casePublic, new CustomUserPrincipal(userId, userPublic, userPublic + "@example.test"));
    }

    static int count(String table, String where, Object... args) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo." + table + " WHERE " + where, Integer.class, args);
    }

    static com.legacyvault.verification.dto.BasisDossierResponse intakeVersion(Fixture f, String type) {
        UUID asset = UUID.randomUUID();
        UUID beneficiary = UUID.randomUUID();
        jdbc.update("INSERT dbo.assets (public_id, vault_id, asset_type, title) VALUES (?, ?, 'TEXT', 'Allocation fixture')", asset.toString(), f.vaultId());
        jdbc.update("INSERT dbo.beneficiaries (public_id, vault_id, full_name) VALUES (?, ?, 'Beneficiary fixture')", beneficiary.toString(), f.vaultId());
        var metadata = new com.legacyvault.verification.dto.BasisIntakeMetadata(type, "Court fixture", "Document fixture",
                java.time.LocalDate.of(2026, 1, 1), "Notary fixture", "Notarial fixture", java.time.LocalDate.of(2026, 1, 1),
                "Receipt fixture", null, java.util.List.of(new com.legacyvault.verification.dto.AllocationInput(asset, beneficiary, null)));
        var file = new org.springframework.mock.web.MockMultipartFile("file", "fixture.pdf", "application/pdf",
                "%PDF-1.4\nFixture only\n%%EOF".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return context.getBean(com.legacyvault.verification.service.BasisIntakeService.class)
                .intake(f.publicCaseId(), f.legal(), metadata, file);
    }

    record Fixture(long userId, long vaultId, long caseId, UUID publicCaseId, CustomUserPrincipal legal) { }
}
