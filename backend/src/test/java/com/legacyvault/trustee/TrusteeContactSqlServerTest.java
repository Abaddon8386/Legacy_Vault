package com.legacyvault.trustee;

import com.legacyvault.LegacyvaultBackendApplication;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.service.VaultService;
import org.flywaydb.core.Flyway;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.scheduling.config.TaskManagementConfigUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import static org.junit.jupiter.api.Assertions.*;

/** Disposable database only. Real branch migrations run through Flyway, including the V11 upgrade path. */
@EnabledIfEnvironmentVariable(named = "STAFF_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
public class TrusteeContactSqlServerTest {
    protected static ConfigurableApplicationContext context;
    protected static JdbcTemplate jdbc;
    static JdbcTemplate master;
    static String database;
    protected static TransactionTemplate tx;
    protected static final List<String> sql = new CopyOnWriteArrayList<>();
    protected Long ownerId, staffId, vaultId, caseId;
    protected UUID ownerPublicId, staffPublicId, vaultPublicId, trusteePublicId;
    protected ExecutorService workers;

    @Configuration(proxyBeanMethods = false)
    public static class SqlCapture {
        @Bean HibernatePropertiesCustomizer captureSql() {
            return properties -> properties.put("hibernate.session_factory.statement_inspector",
                    (StatementInspector) statement -> { sql.add(statement); return statement; });
        }
    }

    @BeforeAll static void start() throws Exception {
        String masterUrl = System.getenv("STAFF_SQLSERVER_MASTER_URL");
        master = new JdbcTemplate(new DriverManagerDataSource(masterUrl));
        database = "LegacyVault_StaffPatch_" + UUID.randomUUID().toString().replace("-", "");
        master.execute("CREATE DATABASE [" + database + "]");
        String url = masterUrl.replace("databaseName=master;", "databaseName=" + database + ";");
        jdbc = new JdbcTemplate(new DriverManagerDataSource(url));
        Path migrations = Path.of("../database/migration").toAbsolutePath().normalize();
        // Simulate an existing V11 deployment, then let Spring apply/validate the actual feature migrations.
        // A fresh full-branch migration is also covered by contextLoads in the complete regression run.
        Flyway.configure().dataSource(url, null, null).locations("filesystem:" + migrations)
                .target("11").load().migrate();
        String key = Base64.getEncoder().encodeToString(new byte[32]);
        context = new SpringApplicationBuilder(LegacyvaultBackendApplication.class, SqlCapture.class)
                .initializers(app -> app.addBeanFactoryPostProcessor(factory -> {
                    var registry = (BeanDefinitionRegistry) factory;
                    String name = TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME;
                    if (registry.containsBeanDefinition(name)) registry.removeBeanDefinition(name);
                })).run("--spring.datasource.url=" + url, "--spring.flyway.enabled=true", "--server.port=0",
                        "--legacyvault.jwt.secret=" + key, "--legacyvault.encryption.key=" + key,
                        "--logging.level.root=ERROR", "--logging.level.org.springframework.security=ERROR");
        tx = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        tx.setTimeout(20);
    }

    @AfterAll static void stop() throws Exception {
        if (context != null) context.close();
        if (database != null && database.matches("LegacyVault_StaffPatch_[0-9a-f]{32}")) {
            master.execute("ALTER DATABASE [" + database + "] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");
            master.execute("DROP DATABASE [" + database + "]");
        }
    }

    @BeforeEach void seed() {
        ownerPublicId = UUID.randomUUID(); staffPublicId = UUID.randomUUID();
        ownerId = user(ownerPublicId); staffId = user(staffPublicId);
        vaultPublicId = UUID.randomUUID(); trusteePublicId = UUID.randomUUID();
        jdbc.update("INSERT dbo.vaults(public_id,owner_user_id,vault_name,status) VALUES (?,?,'Staff Patch','AWAITING_VERIFICATION')", vaultPublicId.toString(), ownerId);
        vaultId = jdbc.queryForObject("SELECT vault_id FROM dbo.vaults WHERE owner_user_id=?", Long.class, ownerId);
        jdbc.update("INSERT dbo.dms_configs(owner_user_id,check_interval_days,grace_period_days,status,triggered_at,grace_period_ends_at) VALUES (?,30,1,'GRACE_PERIOD_EXCEEDED',DATEADD(day,-2,SYSUTCDATETIME()),DATEADD(day,-1,SYSUTCDATETIME()))", ownerId);
        jdbc.update("INSERT dbo.trustees(public_id,vault_id,full_name,status,phone_number) VALUES (?,?,'Trustee','APPOINTED','0900000000')", trusteePublicId.toString(), vaultId);
        jdbc.update("INSERT dbo.verification_cases(vault_id,triggered_at,assigned_staff_user_id) VALUES (?,SYSUTCDATETIME(),?)", vaultId, staffId);
        caseId = jdbc.queryForObject("SELECT verification_case_id FROM dbo.verification_cases WHERE vault_id=?", Long.class, vaultId);
        workers = Executors.newFixedThreadPool(2);
        sql.clear();
    }

    Long user(UUID id) {
        jdbc.update("INSERT dbo.users(public_id,full_name,email,password_hash,status) VALUES (?,'Staff Patch',?,'unused','ACTIVE')", id.toString(), id + "@test.invalid");
        return jdbc.queryForObject("SELECT user_id FROM dbo.users WHERE public_id=?", Long.class, id.toString());
    }
    @AfterEach void stopWorkers() throws Exception {
        if (workers != null) { workers.shutdownNow(); assertTrue(workers.awaitTermination(25, TimeUnit.SECONDS)); }
    }
    protected <T> T asStaff(Supplier<T> work) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new CustomUserPrincipal(staffId, staffPublicId, "staff@test.invalid"), null,
                List.of(new SimpleGrantedAuthority("ROLE_STAFF_EXECUTOR"))));
        try { return work.get(); } finally { SecurityContextHolder.clearContext(); }
    }
    protected void contact() {
        asStaff(() -> context.getBean(TrusteeContactService.class).record(trusteePublicId,
                new TrusteeContactDtos.RecordRequest(TrusteeContactDtos.Channel.PHONE,
                        TrusteeContactDtos.Outcome.CONTACTED, TrusteeContactDtos.FallbackStatus.NOT_REQUIRED, "sensitive note")));
    }
    protected void cancel() {
        context.getBean(VaultService.class).cancelAlert(vaultPublicId, new CustomUserPrincipal(ownerId, ownerPublicId, "owner@test.invalid"));
    }
    protected int contacts() { return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.trustee_contact_records r JOIN dbo.trustees t ON t.trustee_id=r.trustee_id WHERE t.vault_id=?", Integer.class, vaultId); }
    protected int audits(String action) { return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE vault_id=? AND action=?", Integer.class, vaultId, action); }
    protected void notFound(Runnable work) { assertEquals(ErrorCode.RESOURCE_NOT_FOUND, assertThrows(BusinessException.class, work::run).getErrorCode()); }
    protected static void await(CountDownLatch latch) {
        try { assertTrue(latch.await(15, TimeUnit.SECONDS)); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new RuntimeException(e); }
    }

    @Test void sqlPredicatesHideEveryRejectedCaseAndEmptyHistory() {
        for (String update : List.of("assigned_staff_user_id=NULL", "assigned_staff_user_id=" + ownerId,
                "status='CANCELLED'")) {
            jdbc.update("UPDATE dbo.verification_cases SET " + update + " WHERE verification_case_id=?", caseId);
            notFound(this::contact);
            notFound(() -> asStaff(() -> context.getBean(TrusteeContactService.class).history(trusteePublicId)));
            jdbc.update("UPDATE dbo.verification_cases SET status='OPEN',assigned_staff_user_id=? WHERE verification_case_id=?", staffId, caseId);
        }
        Long otherOwner = user(UUID.randomUUID());
        jdbc.update("INSERT dbo.vaults(owner_user_id,vault_name) VALUES (?,'Other Vault')", otherOwner);
        Long otherVault = jdbc.queryForObject("SELECT vault_id FROM dbo.vaults WHERE owner_user_id=?", Long.class, otherOwner);
        jdbc.update("UPDATE dbo.verification_cases SET vault_id=? WHERE verification_case_id=?", otherVault, caseId);
        notFound(this::contact);
        notFound(() -> asStaff(() -> context.getBean(TrusteeContactService.class).history(trusteePublicId)));
        jdbc.update("DELETE dbo.verification_cases WHERE verification_case_id=?", caseId);
        notFound(this::contact);
        notFound(() -> asStaff(() -> context.getBean(TrusteeContactService.class).history(trusteePublicId)));
        assertEquals(0, contacts()); assertEquals(0, audits("TRUSTEE_CONTACT_RECORDED"));
    }

    @Test void repeatedContactsAndSqlServerUpdateLocks() {
        contact(); contact(); assertEquals(2, contacts());
        assertEquals(2, audits("TRUSTEE_CONTACT_RECORDED"));
        assertTrue(sql.stream().anyMatch(s -> s.toLowerCase().contains("verification_cases") && s.toLowerCase().contains("updlock")), sql.toString());
        assertTrue(sql.stream().anyMatch(s -> s.toLowerCase().contains("vaults") && s.toLowerCase().contains("updlock")));
        sql.stream().filter(s -> s.toLowerCase().contains("updlock")).distinct()
                .forEach(s -> System.out.println("Verified Hibernate SQL Server lock: " + s));
        assertFalse(jdbc.queryForObject("SELECT TOP 1 details FROM dbo.audit_logs WHERE vault_id=? AND action='TRUSTEE_CONTACT_RECORDED'", String.class, vaultId).contains("sensitive note"));
    }

    @Test void auditDatabaseFailureRollsBackHistory() {
        String trigger = "fail_contact_" + vaultId;
        jdbc.execute("CREATE TRIGGER dbo." + trigger + " ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE vault_id=" + vaultId + " AND action='TRUSTEE_CONTACT_RECORDED') THROW 51000, 'injected audit failure', 1; END");
        try { assertThrows(RuntimeException.class, this::contact); }
        finally { jdbc.execute("DROP TRIGGER dbo." + trigger); }
        assertEquals(0, contacts()); assertEquals(0, audits("TRUSTEE_CONTACT_RECORDED"));
    }

    @Test void cancelCommitsFirstSoWaitingContactIsRejected() throws Exception {
        CountDownLatch locked = new CountDownLatch(1), release = new CountDownLatch(1);
        Future<?> cancellation = workers.submit(() -> tx.execute(s -> { cancel(); locked.countDown(); await(release); return null; }));
        try {
            assertTrue(locked.await(10, TimeUnit.SECONDS));
            Future<?> write = workers.submit(() -> notFound(this::contact));
            assertThrows(TimeoutException.class, () -> write.get(300, TimeUnit.MILLISECONDS));
            release.countDown(); cancellation.get(20, TimeUnit.SECONDS); write.get(20, TimeUnit.SECONDS);
            assertEquals(0, contacts()); assertEquals(0, audits("TRUSTEE_CONTACT_RECORDED"));
        } finally { release.countDown(); }
    }

    @Test void contactRetainsLocksUntilCommitThenCancelContinues() throws Exception {
        CountDownLatch locked = new CountDownLatch(1), release = new CountDownLatch(1);
        Future<?> write = workers.submit(() -> tx.execute(s -> { contact(); locked.countDown(); await(release); return null; }));
        try {
            assertTrue(locked.await(10, TimeUnit.SECONDS));
            Future<?> cancellation = workers.submit(this::cancel);
            assertThrows(TimeoutException.class, () -> cancellation.get(300, TimeUnit.MILLISECONDS));
            release.countDown(); write.get(20, TimeUnit.SECONDS); cancellation.get(20, TimeUnit.SECONDS);
            assertEquals(1, contacts()); assertEquals(1, audits("TRUSTEE_CONTACT_RECORDED"));
            notFound(this::contact);
        } finally { release.countDown(); }
    }

    @Test void databaseRejectsDuplicateOpenCaseForVault() {
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> jdbc.update(
                "INSERT dbo.verification_cases(vault_id,triggered_at) VALUES (?,SYSUTCDATETIME())", vaultId));
    }

    @Test void fullBranchFlywayHistoryIsValidAndHasNoPendingMigration() throws Exception {
        Flyway flyway = context.getBean(Flyway.class);
        flyway.validate();
        assertEquals(0, flyway.info().pending().length);
        long migrationCount;
        try (var files = Files.list(Path.of("../database/migration"))) {
            migrationCount = files.filter(p -> p.getFileName().toString().endsWith(".sql")).count();
        }
        assertEquals(migrationCount, flyway.info().applied().length);
        assertTrue(Arrays.stream(flyway.info().applied())
                .anyMatch(m -> "V12__trustee_contact_outcomes.sql".equals(m.getScript()) && m.getVersion().toString().equals("12")));
    }

    @Test void auditAdapterPersistsPlainWorkflowStatesAsValidJson() {
        var adapter = context.getBean(com.legacyvault.common.audit.AuditService.class);
        for (String status : List.of("MONITORING", "APPOINTED", "NOT_CONFIGURED")) {
            tx.execute(s -> {
                adapter.record(staffId, vaultId, "DMS_CONFIGURED", "VAULT", vaultId, "USER",
                        Map.of("stateBefore", status, "stateAfter", status));
                return null;
            });
        }
        assertEquals(3, jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.audit_logs WHERE vault_id=? AND action='DMS_CONFIGURED'
                  AND ISJSON(state_before)=1 AND ISJSON(state_after)=1
                  AND JSON_VALUE(state_before,'$.status')=JSON_VALUE(state_after,'$.status')
                """, Integer.class, vaultId));
    }

    @Test void revokedTrusteeRejectsNewContactAndRetainsExistingHistory() {
        contact();
        jdbc.update("UPDATE dbo.trustees SET status='REVOKED',revoked_at=SYSUTCDATETIME() WHERE public_id=?", trusteePublicId.toString());
        assertEquals(ErrorCode.TRUSTEE_REVOKED, assertThrows(BusinessException.class, this::contact).getErrorCode());
        assertEquals(1, contacts());
        assertEquals(1, audits("TRUSTEE_CONTACT_RECORDED"));
        assertEquals(1, asStaff(() -> context.getBean(TrusteeContactService.class).history(trusteePublicId)).size());
        jdbc.update("UPDATE dbo.verification_cases SET assigned_staff_user_id=NULL WHERE verification_case_id=?", caseId);
        notFound(this::contact); // case authorization precedes REVOKED policy and does not reveal status.
    }

    @Test void staleTrusteeLoadedBeforeRevocationIsRefreshedUnderLocks() throws Exception {
        CountDownLatch loaded = new CountDownLatch(1), release = new CountDownLatch(1);
        Future<?> write = workers.submit(() -> assertEquals(ErrorCode.TRUSTEE_REVOKED,
                assertThrows(BusinessException.class, () -> tx.execute(s -> {
            Trustee stale = context.getBean(TrusteeRepository.class).findByPublicId(trusteePublicId).orElseThrow();
            assertEquals("APPOINTED", stale.getStatus());
            loaded.countDown(); await(release);
            contact();
            return null;
        })).getErrorCode()));
        try {
            assertTrue(loaded.await(10, TimeUnit.SECONDS));
            jdbc.update("UPDATE dbo.trustees SET status='REVOKED',revoked_at=SYSUTCDATETIME() WHERE public_id=?", trusteePublicId.toString());
            release.countDown(); write.get(20, TimeUnit.SECONDS);
            assertEquals(0, contacts()); assertEquals(0, audits("TRUSTEE_CONTACT_RECORDED"));
        } finally { release.countDown(); }
    }
}
