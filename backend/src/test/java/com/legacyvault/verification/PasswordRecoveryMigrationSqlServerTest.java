package com.legacyvault.verification;

import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class PasswordRecoveryMigrationSqlServerTest {
    @Test void failedUpgradeRollsBackAllDdlThenRetryPreservesPasswordsAndClassifiesOnlyProvenAccounts() throws Exception {
        String master=System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        String db="LegacyVault_RecoveryMigration_"+UUID.randomUUID().toString().replace("-","");
        String url=master.replace("databaseName=master;","databaseName="+db+";");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()) { s.execute("CREATE DATABASE ["+db+"]"); }
        String hash=new BCryptPasswordEncoder().encode("Preserved-password-123");
        try {
            Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("38").load().migrate();
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var p=c.prepareStatement("INSERT dbo.users(full_name,email,password_hash,status) VALUES ('Registered','registered@fixture.test',?,'ACTIVE'),('Unclassified','unknown@fixture.test',?,'ACTIVE')")) {
                    p.setString(1,hash); p.setString(2,hash); p.executeUpdate();
                }
                s.executeUpdate("INSERT dbo.audit_logs(action,entity_type,entity_id) SELECT 'AUTH_REGISTERED','USER',user_id FROM dbo.users WHERE email='registered@fixture.test'");
                // Force a late DDL failure, after the users columns, credential table and job table.
                s.execute("CREATE TABLE dbo.password_recovery_limits (fixture_id int)");
            }
            var upgrade=Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").load();
            assertThrows(RuntimeException.class,upgrade::migrate);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.users') AND name='auth_version'")) { assertTrue(r.next()); assertEquals(0,r.getInt(1)); }
                try(var r=s.executeQuery("SELECT COUNT(*) FROM sys.tables WHERE name IN ('password_reset_credentials','password_recovery_jobs')")) { assertTrue(r.next()); assertEquals(0,r.getInt(1)); }
                try(var r=s.executeQuery("SELECT COUNT(*) FROM dbo.flyway_schema_history WHERE version='39'")) { assertTrue(r.next()); assertEquals(0,r.getInt(1)); }
                s.execute("DROP TABLE dbo.password_recovery_limits");
            }
            upgrade.migrate(); upgrade.validate(); assertEquals(0,upgrade.migrate().migrationsExecuted);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement();var r=s.executeQuery("SELECT email,password_hash,auth_version,password_login_enabled FROM dbo.users ORDER BY email")) {
                assertTrue(r.next()); assertEquals("registered@fixture.test",r.getString(1)); assertEquals(hash,r.getString(2)); assertEquals(0,r.getLong(3)); assertTrue(r.getBoolean(4));
                assertTrue(r.next()); assertEquals(hash,r.getString(2)); assertNull(r.getObject(4)); assertFalse(r.next());
            }
        } finally {
            if(!db.matches("LegacyVault_RecoveryMigration_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe fixture name");
            try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {
                s.execute("ALTER DATABASE ["+db+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE"); s.execute("DROP DATABASE ["+db+"]");
            }
        }
    }
}
