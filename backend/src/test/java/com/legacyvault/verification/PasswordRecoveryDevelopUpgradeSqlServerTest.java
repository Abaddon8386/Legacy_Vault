package com.legacyvault.verification;

import java.nio.file.*;
import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

/** Simulates an installed develop release that has applied PS-103 V40 before seeing PS-112. */
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class PasswordRecoveryDevelopUpgradeSqlServerTest {
    @TempDir Path installedRelease;

    @Test void installedDevelopV40RejectsOldV39ButUpgradesToV41WithoutRepairOrOutOfOrderAndPreservesStaffFiles() throws Exception {
        Path packaged=Path.of(getClass().getResource("/db/migration/").toURI());
        assertNull(getClass().getResource("/db/migration/V39__password_recovery.sql"));
        assertNull(getClass().getResource("/db/migration/V40__bind_recovery_email_and_prepare_once.sql"));
        try(var files=Files.list(packaged)) {
            for(Path file:files.filter(p->p.getFileName().toString().endsWith(".sql")).toList()) {
                var version=java.util.regex.Pattern.compile("^V(\\d+)(?:_\\d+)?__").matcher(file.getFileName().toString());
                if(version.find() && Integer.parseInt(version.group(1))<=40)
                    Files.copy(file,installedRelease.resolve(file.getFileName()));
            }
        }
        String master=System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        String db="LegacyVault_RecoveryUpgrade_"+UUID.randomUUID().toString().replace("-","");
        String url=master.replace("databaseName=master;","databaseName="+db+";");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()) { s.execute("CREATE DATABASE ["+db+"]"); }
        try {
            var develop=Flyway.configure().dataSource(url,null,null).locations("filesystem:"+installedRelease).load();
            develop.migrate(); develop.validate();
            Integer v40Checksum;
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT checksum FROM dbo.flyway_schema_history WHERE version='40' AND success=1")) { assertTrue(r.next()); v40Checksum=r.getInt(1); assertFalse(r.next()); }
                s.executeUpdate("""
                    INSERT dbo.users(full_name,email,password_hash,status) VALUES ('Preserved staff','upgrade@example.test','preserved-hash','ACTIVE');
                    DECLARE @u bigint=(SELECT user_id FROM dbo.users WHERE email='upgrade@example.test');
                    INSERT dbo.user_roles(user_id,role_id) SELECT @u,role_id FROM dbo.roles WHERE role_code='ROLE_STAFF_EXECUTOR';
                    INSERT dbo.vaults(owner_user_id,vault_name,status) VALUES (@u,'Preserved vault','ACTIVE');
                    DECLARE @v bigint=SCOPE_IDENTITY();
                    INSERT dbo.verification_cases(vault_id,triggered_at,assigned_staff_user_id) VALUES (@v,SYSUTCDATETIME(),@u);
                    DECLARE @c bigint=SCOPE_IDENTITY();
                    INSERT dbo.original_will_intakes(verification_case_id,delivered_by_name,received_by_user_id) VALUES (@c,'Fixture',@u);
                    DECLARE @w bigint=SCOPE_IDENTITY();
                    INSERT dbo.staff_intake_attachments(verification_case_id,original_will_intake_id,original_file_name,content_type,file_size_bytes,sha256_hash,encrypted_file_content,encryption_iv,encryption_key_version,uploaded_by_user_id)
                    VALUES (@c,@w,'preserved.pdf','application/pdf',2,REPLICATE('a',64),0xCAFE,0x000000000000000000000000,'fixture',@u);
                    """);
            }
            // Negative control reproduces the user's real upgrade failure, not just a fresh DB test.
            Path outOfOrder=installedRelease.resolve("V39__password_recovery.sql");
            Files.copy(packaged.resolve("V41__password_recovery.sql"),outOfOrder);
            var bad=Flyway.configure().dataSource(url,null,null).locations("filesystem:"+installedRelease).load();
            var failure=assertThrows(RuntimeException.class,bad::migrate);
            assertTrue(failure.getMessage().contains("Detected resolved migration not applied to database: 39"),failure.getMessage());
            Files.delete(outOfOrder);

            var upgrade=Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("41").load();
            assertFalse(upgrade.getConfiguration().isOutOfOrder());
            assertEquals(1,upgrade.migrate().migrationsExecuted);
            upgrade.validate(); assertEquals(0,upgrade.migrate().migrationsExecuted);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT version,checksum FROM dbo.flyway_schema_history WHERE version IN ('39','40','41') ORDER BY installed_rank")) {
                    assertTrue(r.next()); assertEquals("40",r.getString(1)); assertEquals(v40Checksum.intValue(),r.getInt(2));
                    assertTrue(r.next()); assertEquals("41",r.getString(1)); assertFalse(r.next());
                }
                try(var r=s.executeQuery("SELECT password_hash,status,auth_version,password_login_enabled FROM dbo.users WHERE email='upgrade@example.test'")) {
                    assertTrue(r.next()); assertEquals("preserved-hash",r.getString(1)); assertEquals("ACTIVE",r.getString(2)); assertEquals(0,r.getLong(3)); assertNull(r.getObject(4));
                }
                try(var r=s.executeQuery("SELECT COUNT(*) FROM dbo.user_roles")) { assertTrue(r.next()); assertEquals(1,r.getInt(1)); }
                try(var r=s.executeQuery("SELECT original_file_name,encrypted_file_content,sha256_hash FROM dbo.staff_intake_attachments")) {
                    assertTrue(r.next()); assertEquals("preserved.pdf",r.getString(1)); assertArrayEquals(new byte[]{(byte)0xCA,(byte)0xFE},r.getBytes(2)); assertEquals("a".repeat(64),r.getString(3)); assertFalse(r.next());
                }
                assertThrows(java.sql.SQLException.class,()->s.executeUpdate("UPDATE dbo.staff_intake_attachments SET original_file_name='changed.pdf'"));
                assertThrows(java.sql.SQLException.class,()->s.executeUpdate("INSERT dbo.password_reset_credentials(user_id,credential_hash,auth_version,created_at,expires_at) SELECT user_id,REPLICATE('c',64),0,SYSUTCDATETIME(),DATEADD(minute,15,SYSUTCDATETIME()) FROM dbo.users"));
            }
            String fixtureKey=java.util.Base64.getEncoder().encodeToString(new byte[32]);
            try(var context=new org.springframework.boot.builder.SpringApplicationBuilder(com.legacyvault.LegacyvaultBackendApplication.class)
                    .initializers(app->app.addBeanFactoryPostProcessor(factory->{
                        var registry=(org.springframework.beans.factory.support.BeanDefinitionRegistry)factory;
                        String scheduler=org.springframework.scheduling.config.TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME;
                        if(registry.containsBeanDefinition(scheduler)) registry.removeBeanDefinition(scheduler);
                    })).run("--spring.datasource.url="+url,"--server.port=0","--legacyvault.jwt.secret="+fixtureKey,
                            "--legacyvault.encryption.key="+fixtureKey,"--legacyvault.auth.recovery.email-enabled=false",
                            "--logging.level.root=ERROR","--logging.level.org.flywaydb=ERROR","--logging.level.org.springframework.security=ERROR")) {
                assertTrue(context.isActive());
                assertTrue(context.getBeansOfType(com.legacyvault.auth.recovery.RecoveryDeliveryWorker.class).isEmpty());
                var user=context.getBean(com.legacyvault.user.repository.UserRepository.class).findByEmail("upgrade@example.test").orElseThrow();
                assertEquals("preserved-hash",user.getPasswordHash()); assertEquals(0,user.getAuthVersion());
                var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders
                        .webAppContextSetup((org.springframework.web.context.WebApplicationContext)context)
                        .apply(org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity()).build();
                assertEquals(200,mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/system/ping")).andReturn().getResponse().getStatus());
            }
        } finally {
            if(!db.matches("LegacyVault_RecoveryUpgrade_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe fixture name");
            try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {
                s.execute("ALTER DATABASE ["+db+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE"); s.execute("DROP DATABASE ["+db+"]");
            }
        }
    }
}
