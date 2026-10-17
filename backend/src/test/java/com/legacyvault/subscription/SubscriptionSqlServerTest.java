package com.legacyvault.subscription;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.legacyvault.LegacyvaultBackendApplication;
import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.dto.UpdateAssetRequest;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.subscription.dto.SubscriptionDtos.Current;
import com.legacyvault.subscription.service.OwnerQuotaService;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.dto.CreateVaultRequest;
import com.legacyvault.vault.dto.VaultResponse;
import com.legacyvault.vault.service.VaultService;
import com.legacyvault.will.service.WillService;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.event.service.spi.EventListenerRegistry;
import org.hibernate.event.spi.EventType;
import org.hibernate.event.spi.PostLoadEventListener;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.scheduling.config.TaskManagementConfigUtils;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;

import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Supplier;

/** Opt-in, real Spring/JPA/audit/Flyway/SQL Server. Never accepts an arbitrary JDBC database URL. */
@EnabledIfEnvironmentVariable(named = "PS77_SQLSERVER_TEST_DATABASE", matches = "LegacyVault_PS77_[A-Za-z0-9_]+")
class SubscriptionSqlServerTest {
    static final long BASIC_BYTES = 104_857_600L;
    static ConfigurableApplicationContext context;
    static JdbcTemplate jdbc;
    static MockMvc mvc;
    static VaultService vaults;
    static AssetService assets;
    static WillService wills;
    static OwnerQuotaService quotas;
    static TransactionTemplate tx;
    static final ThreadLocal<Runnable> afterOwnerRead = new ThreadLocal<>();
    record Owner(long id, UUID publicId, String email) {
        CustomUserPrincipal principal() { return new CustomUserPrincipal(id, publicId, email); }
    }
    Owner owner;
    ExecutorService workers;

    @BeforeAll
    static void start() {
        String database = System.getenv("PS77_SQLSERVER_TEST_DATABASE");
        if (database == null || !database.matches("LegacyVault_PS77_[A-Za-z0-9_]+"))
            throw new IllegalArgumentException("Disposable PS-77 database required");
        String server = System.getenv().getOrDefault("PS77_SQLSERVER_TEST_SERVER", "localhost:1433");
        if (!server.matches("[A-Za-z0-9.\\-]+:[0-9]+")) throw new IllegalArgumentException("Expected host:port");
        String url = "jdbc:sqlserver://" + server + ";databaseName=" + database
                + ";encrypt=true;trustServerCertificate=true;integratedSecurity=true";
        String key = Base64.getEncoder().encodeToString(new byte[32]);
        // Exercise the upgrade from the branch's base schema; contextLoads also tests a fresh full migration.
        Flyway.configure().dataSource(url, null, null).locations("classpath:db/migration")
                .target("11").load().migrate();
        context = new SpringApplicationBuilder(LegacyvaultBackendApplication.class)
                .initializers(app -> app.addBeanFactoryPostProcessor(factory -> {
                    var registry = (BeanDefinitionRegistry) factory;
                    String name = TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME;
                    if (registry.containsBeanDefinition(name)) registry.removeBeanDefinition(name);
                })).run("--spring.datasource.url=" + url, "--server.port=0",
                        "--legacyvault.jwt.secret=" + key, "--legacyvault.encryption.key=" + key,
                        "--legacyvault.subscription.quota-enforcement-enabled=true", "--logging.level.root=ERROR", "--logging.level.org.springframework.security=ERROR",
                        "--logging.level.org.hibernate=ERROR", "--logging.level.org.flywaydb=INFO");
        jdbc = context.getBean(JdbcTemplate.class);
        assertEquals(database, jdbc.queryForObject("SELECT DB_NAME()", String.class));
        vaults = context.getBean(VaultService.class);
        assets = context.getBean(AssetService.class);
        wills = context.getBean(WillService.class);
        quotas = context.getBean(OwnerQuotaService.class);
        mvc = MockMvcBuilders.webAppContextSetup((WebApplicationContext) context).apply(springSecurity()).build();
        tx = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        tx.setTimeout(20);
        var factory = context.getBean(EntityManagerFactory.class).unwrap(SessionFactoryImplementor.class);
        factory.getServiceRegistry().getService(EventListenerRegistry.class).appendListeners(EventType.POST_LOAD,
                (PostLoadEventListener) event -> {
                    Runnable hook = afterOwnerRead.get();
                    if (event.getEntity() instanceof User && hook != null) {
                        afterOwnerRead.remove();
                        hook.run();
                    }
                });
        jdbc.update("""
            IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_code = 'ROLE_VAULT_OWNER')
                INSERT INTO dbo.roles(role_code, role_name) VALUES ('ROLE_VAULT_OWNER', 'Owner')
            """);
    }

    @AfterAll
    static void stop() { if (context != null) context.close(); }

    @BeforeEach
    void seed() {
        owner = newOwner();
        workers = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void stopWorkers() throws Exception {
        workers.shutdownNow();
        assertTrue(workers.awaitTermination(25, TimeUnit.SECONDS));
    }

    @Test
    void flywayUsesAllocatedVersionsAndHasNoPendingMigrations() {
        Flyway flyway = context.getBean(Flyway.class);
        flyway.validate();
        assertEquals(0, flyway.info().pending().length);
        var versions = java.util.Arrays.stream(flyway.info().applied()).collect(
                java.util.stream.Collectors.toMap(m -> m.getScript(), m -> m.getVersion().toString()));
        assertEquals("19", versions.get("V19__preserve_lifetime_vault_ownership.sql"));
        assertEquals("20", versions.get("V20__subscription_catalog_and_payload_usage.sql"));
        assertEquals("21", versions.get("V21__lifetime_subscription_catalog.sql"));
        assertEquals("22", versions.get("V22__owner_lifetime_entitlements.sql"));
        assertFalse(versions.containsKey("V12__preserve_lifetime_vault_ownership.sql"));
        assertFalse(versions.containsKey("V13__subscription_catalog_and_payload_usage.sql"));
    }

    @Test
    void ownerWithoutVaultGetsBasicAndExactCatalogBytesFromDatabase() throws Exception {
        mvc.perform(get("/api/v1/subscriptions/me").with(as(owner, "VAULT_OWNER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.effectivePlan.code").value("BASIC"))
                .andExpect(jsonPath("$.effectivePlan.limits.storageBytes").value(BASIC_BYTES))
                .andExpect(jsonPath("$.effectivePlan.limits.fileBytes").value(10_485_760))
                .andExpect(jsonPath("$.usage.assetCount").value(0))
                .andExpect(jsonPath("$.usage.storageBytes").value(0))
                .andExpect(jsonPath("$.vaultCreated").value(false));
        mvc.perform(get("/api/v1/subscription-plans").with(as(owner, "VAULT_OWNER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$[1].priceVnd").value(199000))
                .andExpect(jsonPath("$[2].priceVnd").value(499000))
                .andExpect(jsonPath("$[1].billingModel").value("LIFETIME"))
                .andExpect(jsonPath("$[1].version").value(2))
                .andExpect(jsonPath("$[1].monthlyPriceVnd").doesNotExist())
                .andExpect(jsonPath("$[2].limits.storageBytes").value(5_368_709_120L));
        assertEquals(0, vaultCount(owner));
    }

    @Test
    void registrationGetsImplicitBasicWithoutCreatingVault() throws Exception {
        String email = UUID.randomUUID() + "@example.test";
        mvc.perform(post("/api/v1/auth/register").contentType("application/json")
                .content("{\"fullName\":\"Test Owner\",\"email\":\"" + email
                        + "\",\"password\":\"Test-password-77\"}"))
                .andExpect(status().isCreated());
        Long id = jdbc.queryForObject("SELECT user_id FROM dbo.users WHERE email = ?", Long.class, email);
        assertEquals("BASIC", quotas.current(id).effectivePlan().code());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vaults WHERE owner_user_id = ?", Integer.class, id));
    }

    @Test
    void subscriptionApiRequiresOwnerAndHasNoGrantEndpoint() throws Exception {
        mvc.perform(get("/api/v1/subscriptions/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/subscriptions/me").with(as(owner, "STAFF"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/subscription-grants").with(as(owner, "VAULT_OWNER"))
                .contentType("application/json").content("{}"))
                .andExpect(status().isNotFound());
        Owner other = newOwner();
        createVault(other);
        mvc.perform(get("/api/v1/subscriptions/me?ownerId=" + other.publicId()).with(as(owner, "VAULT_OWNER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.vaultCreated").value(false));
    }

    @Test
    void realBearerAuthenticationUsesCurrentDatabaseRolesAndAccountState() throws Exception {
        String token = context.getBean(com.legacyvault.auth.JwtService.class)
                .generateAccessToken(owner.publicId(), owner.email(), List.of("ROLE_VAULT_OWNER"));
        // A claimed role alone grants nothing: JwtAuthenticationFilter reloads actual DB roles.
        mvc.perform(get("/api/v1/subscriptions/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_VAULT_OWNER'", owner.id());
        mvc.perform(get("/api/v1/subscriptions/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.effectivePlan.code").value("BASIC"));
        mvc.perform(get("/api/v1/subscription-plans").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        jdbc.update("DELETE dbo.user_roles WHERE user_id=?", owner.id());
        mvc.perform(get("/api/v1/subscription-plans").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_VAULT_OWNER'", owner.id());
        jdbc.update("UPDATE dbo.users SET deleted_at=SYSUTCDATETIME() WHERE user_id=?", owner.id());
        mvc.perform(get("/api/v1/subscriptions/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        jdbc.update("UPDATE dbo.users SET deleted_at=NULL,status='INACTIVE' WHERE user_id=?", owner.id());
        mvc.perform(get("/api/v1/subscription-plans").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void staleActiveVaultCannotBypassACommittedHold() throws Exception {
        UUID vaultId = createVault(owner).id();
        CountDownLatch loaded = new CountDownLatch(1), release = new CountDownLatch(1);
        Future<ErrorCode> write = workers.submit(() -> businessError(() -> tx.execute(s -> {
            var cached = context.getBean(com.legacyvault.vault.repository.VaultRepository.class)
                    .findByPublicId(vaultId).orElseThrow();
            assertEquals("ACTIVE", cached.getStatus());
            loaded.countDown(); await(release);
            return assets.createAsset(vaultId, owner.id(), asset());
        })));
        try {
            assertTrue(loaded.await(10, TimeUnit.SECONDS));
            jdbc.update("UPDATE dbo.vaults SET status='ON_HOLD' WHERE public_id=?", vaultId.toString());
            release.countDown();
            assertEquals(ErrorCode.VAULT_NOT_EDITABLE, write.get(20, TimeUnit.SECONDS));
            assertEquals(0, quotas.current(owner.id()).usage().assetCount());
            assertEquals(0, auditCount(owner, "ASSET_CREATED"));
        } finally { release.countDown(); }
    }

    @Test
    void contentWriteRetainsVaultLockUntilContentAndAuditCommit() throws Exception {
        UUID vaultId = createVault(owner).id();
        CountDownLatch written = new CountDownLatch(1), release = new CountDownLatch(1);
        Future<?> write = workers.submit(() -> tx.execute(s -> {
            assets.createAsset(vaultId, owner.id(), asset());
            written.countDown(); await(release); return null;
        }));
        try {
            assertTrue(written.await(10, TimeUnit.SECONDS));
            Future<?> hold = workers.submit(() -> jdbc.update(
                    "UPDATE dbo.vaults SET status='ON_HOLD' WHERE public_id=?", vaultId.toString()));
            assertThrows(TimeoutException.class, () -> hold.get(300, TimeUnit.MILLISECONDS));
            release.countDown(); write.get(20, TimeUnit.SECONDS); hold.get(20, TimeUnit.SECONDS);
            assertEquals(1, quotas.current(owner.id()).usage().assetCount());
            assertEquals(1, auditCount(owner, "ASSET_CREATED"));
            assertEquals(ErrorCode.VAULT_NOT_EDITABLE,
                    businessError(() -> assets.createAsset(vaultId, owner.id(), asset())));
        } finally { release.countDown(); }
    }

    @Test
    void stalePayloadSizeIsRefreshedBeforeCalculatingQuotaDelta() throws Exception {
        UUID vaultId = createVault(owner).id();
        var initial = assets.createAsset(vaultId, owner.id(), new CreateAssetRequest("Payload", "TEXT", null, "x".repeat(20)));
        var will = wills.uploadWill(vaultId, owner.id(), pdf(32), null);
        jdbc.update("UPDATE dbo.asset_versions SET file_size_bytes=? WHERE asset_id=(SELECT asset_id FROM dbo.assets WHERE public_id=?)",
                BASIC_BYTES - 40, will.id().toString());
        long vaultDbId = jdbc.queryForObject("SELECT vault_id FROM dbo.vaults WHERE public_id=?", Long.class, vaultId.toString());
        CountDownLatch loaded = new CountDownLatch(1), release = new CountDownLatch(1);
        Future<?> shrink = workers.submit(() -> tx.execute(s -> {
            var cached = context.getBean(com.legacyvault.asset.repository.AssetRepository.class)
                    .findByPublicIdAndVaultIdAndAssetTypeNot(initial.id(), vaultDbId, com.legacyvault.asset.entity.AssetType.DOCUMENT)
                    .orElseThrow();
            assertEquals(20, cached.getPayloadSizeBytes());
            loaded.countDown(); await(release);
            return assets.updateAsset(vaultId, initial.id(), owner.id(), new UpdateAssetRequest(null, null, "x".repeat(30)));
        }));
        try {
            assertTrue(loaded.await(10, TimeUnit.SECONDS));
            assets.updateAsset(vaultId, initial.id(), owner.id(), new UpdateAssetRequest(null, null, "x".repeat(40)));
            assertEquals(BASIC_BYTES, quotas.current(owner.id()).usage().storageBytes());
            release.countDown(); shrink.get(20, TimeUnit.SECONDS);
            assertEquals(BASIC_BYTES - 10, quotas.current(owner.id()).usage().storageBytes());
            assertEquals(2, auditCount(owner, "ASSET_UPDATED"));
        } finally { release.countDown(); }
    }

    @Test
    void simultaneousFirstVaultRequestsProduceOne201One409AndOneAudit() throws Exception {
        var firstHasLock = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var secondStarted = new CountDownLatch(1);
        Future<MvcResult> first = workers.submit(() -> {
            afterOwnerRead.set(() -> { firstHasLock.countDown(); await(release); });
            try { return postVault(owner); }
            finally { afterOwnerRead.remove(); }
        });
        try {
            assertTrue(firstHasLock.await(10, TimeUnit.SECONDS));
            Future<MvcResult> second = workers.submit(() -> { secondStarted.countDown(); return postVault(owner); });
            assertTrue(secondStarted.await(5, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class, () -> second.get(300, TimeUnit.MILLISECONDS));
            release.countDown();
            assertEquals(201, first.get(15, TimeUnit.SECONDS).getResponse().getStatus());
            MvcResult duplicate = second.get(15, TimeUnit.SECONDS);
            assertEquals(409, duplicate.getResponse().getStatus());
            assertTrue(duplicate.getResponse().getContentAsString().contains("VAULT_ALREADY_EXISTS"));
            assertEquals(1, vaultCount(owner));
            assertEquals(1, auditCount(owner, "VAULT_CREATED"));
        } finally { release.countDown(); }
    }

    @Test
    void retainedVaultCannotBeRecreatedRegardlessOfStatusOrSoftDeletedOwner() throws Exception {
        createVault(owner);
        for (String state : List.of("CLOSED", "ARCHIVED", "DELETED")) {
            // Raw states exercise status-independent uniqueness, not new application workflows.
            jdbc.update("UPDATE dbo.vaults SET status = ? WHERE owner_user_id = ?", state, owner.id());
            mvc.perform(post("/api/v1/vaults").with(as(owner, "VAULT_OWNER"))
                    .contentType("application/json").content("{\"name\":\"Again\"}"))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VAULT_ALREADY_EXISTS"));
        }
        jdbc.update("UPDATE dbo.users SET deleted_at = SYSUTCDATETIME() WHERE user_id = ?", owner.id());
        mvc.perform(post("/api/v1/vaults").with(as(owner, "VAULT_OWNER"))
                .contentType("application/json").content("{\"name\":\"Again\"}"))
                .andExpect(status().isUnauthorized());
        assertEquals(1, vaultCount(owner));
    }

    @Test
    void databaseRejectsMultirowDeleteAndOwnerReassignmentButAllowsMetadataUpdates() {
        createVault(owner);
        Owner other = newOwner();
        createVault(other);
        DataAccessException deletion = assertThrows(DataAccessException.class,
                () -> jdbc.update("DELETE FROM dbo.vaults WHERE owner_user_id IN (?, ?)", owner.id(), other.id()));
        assertEquals(51777, sqlError(deletion));
        assertEquals(1, vaultCount(owner));
        assertEquals(1, vaultCount(other));
        Owner third = newOwner();
        DataAccessException transfer = assertThrows(DataAccessException.class,
                () -> jdbc.update("UPDATE dbo.vaults SET owner_user_id = ? WHERE owner_user_id = ?", third.id(), owner.id()));
        assertEquals(51778, sqlError(transfer));
        jdbc.update("UPDATE dbo.vaults SET vault_name = 'Renamed', owner_user_id = owner_user_id WHERE owner_user_id = ?", owner.id());
        assertEquals(1, vaultCount(owner));
        assertEquals(0, vaultCount(third));
    }

    @Test
    void duplicatePreflightFailsWithoutDeletingOrCombiningRows() throws Exception {
        createVault(owner);
        String preflight = new ClassPathResource("db/migration/V19__preserve_lifetime_vault_ownership.sql")
                .getContentAsString(StandardCharsets.UTF_8).split("(?m)^GO\\s*$")[0];
        DataAccessException failure = assertThrows(DataAccessException.class, () -> tx.execute(s -> {
            jdbc.execute("ALTER TABLE dbo.vaults DROP CONSTRAINT UQ_vaults_owner");
            jdbc.update("INSERT INTO dbo.vaults(owner_user_id, vault_name) VALUES (?, 'Duplicate fixture')", owner.id());
            assertEquals(2, vaultCount(owner));
            jdbc.execute(preflight);
            return null;
        }));
        assertEquals(51775, sqlError(failure));
        assertEquals(1, vaultCount(owner)); // DDL and duplicate fixture rolled back together.
    }

    @Test
    void countQuotaIncludesDocumentsAndAllVersionsCountOnlyOncePerAsset() {
        UUID vault = createVault(owner).id();
        String text = "Tiếng Việt 🔑";
        assets.createAsset(vault, owner.id(), new CreateAssetRequest("Text", "TEXT", null, text));
        var will = wills.uploadWill(vault, owner.id(), pdf(32), null);
        wills.addVersion(vault, will.id(), owner.id(), pdf(48));
        Current current = quotas.current(owner.id());
        assertEquals(2, current.usage().assetCount());
        assertEquals(text.getBytes(StandardCharsets.UTF_8).length + 80, current.usage().storageBytes());
        assertEquals("UPLOADED", jdbc.queryForObject("SELECT TOP 1 upload_status FROM dbo.asset_versions av JOIN dbo.assets a ON a.asset_id = av.asset_id JOIN dbo.vaults v ON v.vault_id = a.vault_id WHERE v.owner_user_id = ?", String.class, owner.id()));
    }

    @Test
    void fifthAssetSucceedsSixthFailsWithLocalizedSharedApiError() throws Exception {
        UUID vault = createVault(owner).id();
        for (int i = 0; i < 5; i++) assets.createAsset(vault, owner.id(), asset());
        mvc.perform(post("/api/v1/vaults/{id}/assets", vault).with(as(owner, "VAULT_OWNER"))
                .header("Accept-Language", "en").contentType("application/json")
                .content("{\"name\":\"Sixth\",\"assetType\":\"TEXT\",\"payload\":\"value\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ASSET_QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.message").value("The subscription asset limit has been reached."))
                .andExpect(jsonPath("$.traceId").exists());
        assertEquals(5, quotas.current(owner.id()).usage().assetCount());
        assertEquals(5, auditCount(owner, "ASSET_CREATED"));
    }

    @Test
    void concurrentCreatesCannotBothConsumeLastAssetSlot() throws Exception {
        UUID vault = createVault(owner).id();
        for (int i = 0; i < 4; i++) assets.createAsset(vault, owner.id(), asset());
        assertSerializedGrowth(() -> assets.createAsset(vault, owner.id(), asset()), ErrorCode.ASSET_QUOTA_EXCEEDED);
        assertEquals(5, quotas.current(owner.id()).usage().assetCount());
        assertEquals(5, auditCount(owner, "ASSET_CREATED"));
    }

    @Test
    void concurrentVersionsOnDifferentWillsCannotBothConsumeLastStorageBytes() throws Exception {
        UUID vault = createVault(owner).id();
        var first = wills.uploadWill(vault, owner.id(), pdf(32), null);
        var second = wills.uploadWill(vault, owner.id(), pdf(32), null);
        // Retained-size metadata fixture avoids allocating a 100 MB encrypted file in this race test.
        jdbc.update("UPDATE av SET file_size_bytes = ? FROM dbo.asset_versions av JOIN dbo.assets a ON a.asset_id = av.asset_id WHERE a.public_id = ?",
                BASIC_BYTES - 48, first.id().toString());
        assertEquals(BASIC_BYTES - 16, quotas.current(owner.id()).usage().storageBytes());
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        Future<?> one = workers.submit(() -> {
            afterOwnerRead.set(() -> { locked.countDown(); await(release); });
            try { return wills.addVersion(vault, first.id(), owner.id(), pdf(16)); }
            finally { afterOwnerRead.remove(); }
        });
        try {
            assertTrue(locked.await(10, TimeUnit.SECONDS));
            Future<ErrorCode> two = workers.submit(() -> businessError(
                    () -> wills.addVersion(vault, second.id(), owner.id(), pdf(16))));
            assertThrows(TimeoutException.class, () -> two.get(300, TimeUnit.MILLISECONDS));
            release.countDown();
            one.get(15, TimeUnit.SECONDS);
            assertEquals(ErrorCode.STORAGE_QUOTA_EXCEEDED, two.get(15, TimeUnit.SECONDS));
            assertEquals(BASIC_BYTES, quotas.current(owner.id()).usage().storageBytes());
            assertEquals(1, auditCount(owner, "WILL_VERSION_ADDED"));
        } finally { release.countDown(); }
    }

    @Test
    void payloadReplacementUsesDeltaAndOverQuotaCanShrinkWithoutLosingHistory() {
        UUID vault = createVault(owner).id();
        var asset = assets.createAsset(vault, owner.id(), new CreateAssetRequest("Large", "TEXT", null, "x".repeat(30)));
        var will = wills.uploadWill(vault, owner.id(), pdf(32), null);
        jdbc.update("UPDATE av SET file_size_bytes = ? FROM dbo.asset_versions av JOIN dbo.assets a ON a.asset_id = av.asset_id WHERE a.public_id = ?",
                BASIC_BYTES, will.id().toString());
        assertTrue(quotas.current(owner.id()).overQuota().storage());
        assets.updateAsset(vault, asset.id(), owner.id(), new UpdateAssetRequest(null, null, "x".repeat(20)));
        assertEquals(BASIC_BYTES + 20, quotas.current(owner.id()).usage().storageBytes());
        assertEquals(ErrorCode.STORAGE_QUOTA_EXCEEDED, businessError(() -> assets.updateAsset(vault, asset.id(), owner.id(),
                new UpdateAssetRequest(null, null, "x".repeat(21)))));
        assets.updateAsset(vault, asset.id(), owner.id(), new UpdateAssetRequest("Renamed", null, null));
        assertEquals(2, quotas.current(owner.id()).usage().assetCount());
        assertEquals(1, versionCount(owner));
    }

    @Test
    void uploadAuditFailureRollsBackAssetDocumentVersionAndUsage() {
        UUID vault = createVault(owner).id();
        // Deliberate DB audit failure, not a mocked service. The trigger is removed in finally.
        jdbc.execute("""
            CREATE TRIGGER dbo.TR_ps77_test_audit_failure ON dbo.audit_logs AFTER INSERT AS
            BEGIN
                IF EXISTS (SELECT 1 FROM inserted WHERE action = 'WILL_UPLOADED')
                    THROW 51800, 'Synthetic PS-77 audit failure', 1;
            END
            """);
        try {
            assertThrows(RuntimeException.class, () -> wills.uploadWill(vault, owner.id(), pdf(32), null));
            assertEquals(0, quotas.current(owner.id()).usage().assetCount());
            assertEquals(0, quotas.current(owner.id()).usage().storageBytes());
            assertEquals(0, versionCount(owner));
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM dbo.legal_documents ld JOIN dbo.assets a ON a.asset_id = ld.asset_id JOIN dbo.vaults v ON v.vault_id = a.vault_id WHERE v.owner_user_id = ?", Integer.class, owner.id()));
        } finally { jdbc.execute("DROP TRIGGER dbo.TR_ps77_test_audit_failure"); }
    }

    @Test
    void failedVaultAuditDoesNotConsumeLifetimeEntitlement() {
        jdbc.execute("""
            CREATE TRIGGER dbo.TR_ps77_test_vault_audit_failure ON dbo.audit_logs AFTER INSERT AS
            BEGIN
                IF EXISTS (SELECT 1 FROM inserted WHERE action = 'VAULT_CREATED')
                    THROW 51801, 'Synthetic PS-77 Vault audit failure', 1;
            END
            """);
        try {
            assertThrows(RuntimeException.class, () -> createVault(owner));
            assertEquals(0, vaultCount(owner));
        } finally { jdbc.execute("DROP TRIGGER dbo.TR_ps77_test_vault_audit_failure"); }
        createVault(owner);
        assertEquals(1, vaultCount(owner));
        assertEquals(1, auditCount(owner, "VAULT_CREATED"));
    }

    @Test
    void fileLimitAndOwnershipAndVaultStateStillApply() {
        UUID vault = createVault(owner).id();
        assertEquals(ErrorCode.PAYLOAD_TOO_LARGE, businessError(() -> wills.uploadWill(vault, owner.id(), pdf(10_485_761), null)));
        Owner stranger = newOwner();
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, businessError(() -> assets.createAsset(vault, stranger.id(), asset())));
        jdbc.update("UPDATE dbo.vaults SET status = 'AWAITING_VERIFICATION' WHERE owner_user_id = ?", owner.id());
        assertEquals(ErrorCode.VAULT_NOT_EDITABLE, businessError(() -> assets.createAsset(vault, owner.id(), asset())));
        assertEquals(0, quotas.current(owner.id()).usage().assetCount());
    }

    @Test
    void paidUpgradeCannotGrantCapacityEvenWhenQuotaPrototypeEnabled() throws Exception {
        var service=context.getBean(com.legacyvault.subscription.service.SubscriptionUpgradeService.class);
        for(var code:com.legacyvault.subscription.dto.SubscriptionDtos.PlanCode.values()) {
            var request=new com.legacyvault.subscription.dto.SubscriptionDtos.UpgradeRequest(code,2);
            assertEquals(ErrorCode.SUBSCRIPTION_UPGRADE_UNAVAILABLE,businessError(()->service.upgrade(owner.id(),request)));
            mvc.perform(post("/api/v1/subscriptions/me/upgrade").with(as(owner,"VAULT_OWNER"))
                .contentType("application/json").content("{\"planCode\":\""+code+"\",\"catalogVersion\":2}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SUBSCRIPTION_UPGRADE_UNAVAILABLE"));
        }
        assertEquals("BASIC",quotas.current(owner.id()).effectivePlan().code());
        assertEquals(0,auditCount(owner,"SUBSCRIPTION_UPGRADED"));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.owner_subscription_entitlements WHERE owner_user_id=?",Integer.class,owner.id()));
        mvc.perform(post("/api/v1/subscriptions/me/upgrade").contentType("application/json").content("{}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/subscriptions/me/upgrade").with(as(owner,"STAFF_EXECUTOR"))
            .contentType("application/json").content("{\"planCode\":\"EXTENDED\",\"catalogVersion\":2}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void pendingPolicyDoesNotEnforceProposedOwnerLimitsOrExposeCatalog() throws Exception {
        org.springframework.test.util.ReflectionTestUtils.setField(quotas,"enforcementEnabled",false);
        try {
            UUID vault=createVault(owner).id();
            for(int i=0;i<6;i++) assets.createAsset(vault,owner.id(),asset());
            assertEquals(6,quotas.current(owner.id()).usage().assetCount());
            mvc.perform(get("/api/v1/subscription-plans").with(as(owner,"VAULT_OWNER")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SUBSCRIPTION_POLICY_PENDING"));
            mvc.perform(get("/api/v1/subscriptions/me").with(as(owner,"VAULT_OWNER")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SUBSCRIPTION_POLICY_PENDING"));
        } finally {org.springframework.test.util.ReflectionTestUtils.setField(quotas,"enforcementEnabled",true);}
    }

    @Test
    void legacySelfGrantedEntitlementIsNotTrustedAsPaymentConfirmation() {
        jdbc.update("INSERT INTO dbo.owner_subscription_entitlements (owner_user_id,plan_code,catalog_version,purchase_price_vnd,asset_limit,storage_limit_bytes,file_limit_bytes) SELECT ?,plan_code,catalog_version,purchase_price_vnd,asset_limit,storage_limit_bytes,file_limit_bytes FROM dbo.subscription_plans WHERE plan_code='EXTENDED'",owner.id());
        assertEquals("BASIC",quotas.current(owner.id()).effectivePlan().code());
        var service=context.getBean(com.legacyvault.subscription.service.SubscriptionUpgradeService.class);
        assertEquals(ErrorCode.SUBSCRIPTION_UPGRADE_UNAVAILABLE,businessError(()->service.upgrade(owner.id(),
            new com.legacyvault.subscription.dto.SubscriptionDtos.UpgradeRequest(com.legacyvault.subscription.dto.SubscriptionDtos.PlanCode.EXTENDED,2))));
        assertEquals("BASIC",quotas.current(owner.id()).effectivePlan().code());
        assertEquals(0,auditCount(owner,"SUBSCRIPTION_UPGRADED"));
    }

    private void assertSerializedGrowth(Supplier<?> operation, ErrorCode loserCode) throws Exception {
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        Future<?> first = workers.submit(() -> {
            afterOwnerRead.set(() -> { locked.countDown(); await(release); });
            try { return operation.get(); }
            finally { afterOwnerRead.remove(); }
        });
        try {
            assertTrue(locked.await(10, TimeUnit.SECONDS));
            Future<ErrorCode> second = workers.submit(() -> businessError(operation));
            assertThrows(TimeoutException.class, () -> second.get(300, TimeUnit.MILLISECONDS));
            release.countDown();
            first.get(15, TimeUnit.SECONDS);
            assertEquals(loserCode, second.get(15, TimeUnit.SECONDS));
        } finally { release.countDown(); }
    }

    private static Owner newOwner() {
        UUID publicId = UUID.randomUUID();
        String email = publicId + "@example.test";
        jdbc.update("INSERT INTO dbo.users(public_id, full_name, email, password_hash, status) VALUES (?, 'PS77 Owner', ?, 'unused', 'ACTIVE')",
                publicId.toString(), email);
        long id = jdbc.queryForObject("SELECT user_id FROM dbo.users WHERE email = ?", Long.class, email);
        return new Owner(id, publicId, email);
    }

    private static VaultResponse createVault(Owner owner) {
        return vaults.createVault(new CreateVaultRequest("PS77 Vault", null), owner.principal());
    }

    private static MvcResult postVault(Owner owner) throws Exception {
        return mvc.perform(post("/api/v1/vaults").with(as(owner, "VAULT_OWNER"))
                .contentType("application/json").content("{\"name\":\"PS77 Vault\"}")).andReturn();
    }

    private static RequestPostProcessor as(Owner owner, String role) {
        return authentication(new UsernamePasswordAuthenticationToken(owner.principal(), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static CreateAssetRequest asset() { return new CreateAssetRequest("Asset", "TEXT", null, "value"); }
    private static MockMultipartFile pdf(int bytes) {
        byte[] content = new byte[bytes];
        byte[] header = "%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(header, 0, content, 0, Math.min(bytes, header.length));
        return new MockMultipartFile("file", "will.pdf", "application/pdf", content);
    }
    private static int vaultCount(Owner owner) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.vaults WHERE owner_user_id = ?", Integer.class, owner.id());
    }
    private static int auditCount(Owner owner, String action) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE actor_user_id = ? AND action = ?", Integer.class, owner.id(), action);
    }
    private static int versionCount(Owner owner) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.asset_versions av JOIN dbo.assets a ON a.asset_id = av.asset_id JOIN dbo.vaults v ON v.vault_id = a.vault_id WHERE v.owner_user_id = ?", Integer.class, owner.id());
    }
    private static ErrorCode businessError(Supplier<?> operation) {
        return assertThrows(BusinessException.class, operation::get).getErrorCode();
    }
    private static int sqlError(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause())
            if (current instanceof SQLException sql) return sql.getErrorCode();
        throw new AssertionError("SQL error code required", error);
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent test timed out"); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
    }
}
