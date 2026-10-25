package com.legacyvault.dms;

import static org.junit.jupiter.api.Assertions.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Supplier;

import com.legacyvault.LegacyvaultBackendApplication;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import org.junit.jupiter.api.*;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.event.service.spi.EventListenerRegistry;
import org.hibernate.event.spi.EventType;
import org.hibernate.event.spi.PostLoadEventListener;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.scheduling.config.TaskManagementConfigUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Opt-in: use a disposable SQL Server database named LegacyVault_DmsConcurrency_*. */
@EnabledIfEnvironmentVariable(named = "DMS_SQLSERVER_TEST_URL", matches = ".*databaseName=LegacyVault_DmsConcurrency_.*")
class DmsSqlServerConcurrencyTest {
    static ConfigurableApplicationContext context;
    static JdbcTemplate jdbc;
    static DmsConfigRepository configs;
    static DmsService ownerService;
    static DmsTriggerProcessor scheduler;
    static TransactionTemplate tx;
    static final ThreadLocal<Runnable> afterDmsRead = new ThreadLocal<>();
    Long ownerId;
    Long configId;
    UUID publicId;
    ExecutorService workers;

    @BeforeAll
    static void start() {
        String key = Base64.getEncoder().encodeToString(new byte[32]);
        context = new SpringApplicationBuilder(LegacyvaultBackendApplication.class)
                .initializers(application -> application.addBeanFactoryPostProcessor(beanFactory -> {
                    // Invoke scheduler transactions explicitly; prevent an automatic initial scan racing with fixtures.
                    var registry = (BeanDefinitionRegistry) beanFactory;
                    String name = TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME;
                    if (registry.containsBeanDefinition(name)) registry.removeBeanDefinition(name);
                })).run(
                "--spring.datasource.url=" + System.getenv("DMS_SQLSERVER_TEST_URL"),
                "--server.port=0", "--legacyvault.jwt.secret=" + key,
                "--legacyvault.encryption.key=" + key,
                "--logging.level.root=ERROR", "--logging.level.org.springframework.security=ERROR",
                "--logging.level.org.flywaydb=INFO");
        jdbc = context.getBean(JdbcTemplate.class);
        configs = context.getBean(DmsConfigRepository.class);
        ownerService = context.getBean(DmsService.class);
        scheduler = context.getBean(DmsTriggerProcessor.class);
        tx = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        tx.setTimeout(20);
        var factory = context.getBean(EntityManagerFactory.class).unwrap(SessionFactoryImplementor.class);
        factory.getServiceRegistry().getService(EventListenerRegistry.class).appendListeners(EventType.POST_LOAD,
                (PostLoadEventListener) event -> {
                    Runnable pause = afterDmsRead.get();
                    if (event.getEntity() instanceof DmsConfig && pause != null) {
                        afterDmsRead.remove();
                        pause.run();
                    }
                });
    }

    @AfterAll
    static void stop() { if (context != null) context.close(); }

    @BeforeEach
    void seed() {
        publicId = UUID.randomUUID();
        jdbc.update("INSERT INTO dbo.users (public_id, full_name, email, password_hash, status) VALUES (?, 'Concurrency Owner', ?, 'unused', 'ACTIVE')",
                publicId.toString(), publicId + "@example.test");
        ownerId = jdbc.queryForObject("SELECT user_id FROM dbo.users WHERE email = ?", Long.class, publicId + "@example.test");
        jdbc.update("INSERT INTO dbo.vaults (owner_user_id, vault_name) VALUES (?, 'Concurrency Vault')", ownerId);
        jdbc.update("INSERT INTO dbo.beneficiaries (vault_id, full_name) SELECT vault_id, 'Beneficiary' FROM dbo.vaults WHERE owner_user_id = ?", ownerId);
        configId = tx.execute(s -> configs.saveAndFlush(new DmsConfig(ownerId, 30, 1,
                LocalDateTime.now(ZoneOffset.UTC).minusDays(1))).getId());
        workers = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void stopWorkers() throws Exception {
        workers.shutdownNow();
        assertTrue(workers.awaitTermination(25, TimeUnit.SECONDS), "Concurrent transactions must finish before cleanup");
    }

    @Test
    void checkInCommitsFirstSoSchedulerDoesNotTriggerStaleExpiry() throws Exception {
        LocalDateTime scanTime = LocalDateTime.now(ZoneOffset.UTC);
        CountDownLatch rowLocked = new CountDownLatch(1);
        CountDownLatch commitOwner = new CountDownLatch(1);
        Future<?> owner = workers.submit(() -> asOwner(() -> tx.execute(s -> {
            afterDmsRead.set(() -> {
                rowLocked.countDown();
                await(commitOwner);
            });
            try { ownerService.checkIn(); }
            finally { afterDmsRead.remove(); }
            return null;
        })));
        try {
            assertTrue(rowLocked.await(10, TimeUnit.SECONDS));
            Future<?> trigger = workers.submit(() -> scheduler.triggerIfExpired(configId, scanTime));
            assertThrows(TimeoutException.class, () -> trigger.get(300, TimeUnit.MILLISECONDS), "Scheduler must wait for Owner transaction");
            commitOwner.countDown();
            owner.get(15, TimeUnit.SECONDS);
            trigger.get(15, TimeUnit.SECONDS);
            assertEquals("MONITORING", status());
            assertEquals(1, audits("DMS_CHECKED_IN"));
            assertEquals(0, audits("DMS_TRIGGERED"));
            assertNull(jdbc.queryForObject("SELECT triggered_at FROM dbo.dms_configs WHERE dms_id = ?", Object.class, configId));
        } finally { commitOwner.countDown(); }
    }

    @Test
    void schedulerCommitsFirstSoOwnerCanStillCheckInDuringGracePeriod() throws Exception {
        schedulerWins(false);
    }

    @Test
    void schedulerCommitsFirstSoConfigureCannotResetTriggeredState() throws Exception {
        schedulerWins(true);
    }

    private void schedulerWins(boolean configure) throws Exception {
        CountDownLatch triggered = new CountDownLatch(1);
        CountDownLatch commitScheduler = new CountDownLatch(1);
        Future<?> trigger = workers.submit(() -> tx.execute(s -> {
            scheduler.triggerIfExpired(configId, LocalDateTime.now(ZoneOffset.UTC));
            triggered.countDown();
            await(commitScheduler);
            return null;
        }));
        try {
            assertTrue(triggered.await(10, TimeUnit.SECONDS));
            Future<String> owner = workers.submit(() -> asOwner(() -> {
                if (!configure) return ownerService.checkIn().status();
                BusinessException error = assertThrows(BusinessException.class,
                        () -> ownerService.configure(new DmsDtos.ConfigureRequest(60)));
                return error.getErrorCode().name();
            }));
            assertThrows(TimeoutException.class, () -> owner.get(300, TimeUnit.MILLISECONDS), "Owner must wait for scheduler transaction");
            commitScheduler.countDown();
            trigger.get(15, TimeUnit.SECONDS);
            assertEquals(configure ? ErrorCode.DMS_NOT_MONITORING.name() : "MONITORING", owner.get(15, TimeUnit.SECONDS));
            assertEquals(configure ? "TRIGGERED" : "MONITORING", status());
            assertEquals(1, audits("DMS_TRIGGERED"));
            assertEquals(configure ? 0 : 1, audits("DMS_CHECKED_IN"));
            assertEquals(0, audits("DMS_CONFIGURED"));
            if (configure) {
                assertNotNull(jdbc.queryForObject("SELECT triggered_at FROM dbo.dms_configs WHERE dms_id = ?", Object.class, configId));
                assertNotNull(jdbc.queryForObject("SELECT grace_period_ends_at FROM dbo.dms_configs WHERE dms_id = ?", Object.class, configId));
                assertNull(jdbc.queryForObject("SELECT last_check_in_at FROM dbo.dms_configs WHERE dms_id = ?", Object.class, configId));
            } else {
                assertNull(jdbc.queryForObject("SELECT triggered_at FROM dbo.dms_configs WHERE dms_id = ?", Object.class, configId));
                assertNull(jdbc.queryForObject("SELECT grace_period_ends_at FROM dbo.dms_configs WHERE dms_id = ?", Object.class, configId));
                assertNotNull(jdbc.queryForObject("SELECT last_check_in_at FROM dbo.dms_configs WHERE dms_id = ?", Object.class, configId));
            }
        } finally { commitScheduler.countDown(); }
    }

    private String status() {
        return jdbc.queryForObject("SELECT status FROM dbo.dms_configs WHERE dms_id = ?", String.class, configId);
    }

    private int audits(String action) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE entity_type = 'DMS_CONFIG' AND entity_id = ? AND action = ?", Integer.class, configId, action);
    }

    private <T> T asOwner(Supplier<T> operation) {
        var principal = new CustomUserPrincipal(ownerId, publicId, publicId + "@example.test");
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_VAULT_OWNER"))));
        try { return operation.get(); }
        finally { SecurityContextHolder.clearContext(); }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting for competing transaction");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(ex);
        }
    }
}
