package com.legacyvault.verification;

import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class RecoveryBindingMigrationSqlServerTest {
    @Test void v41LateFailureRollsBackEntireSecuritySchemaThenRetryIsFailClosedForOldWriters() throws Exception {
        String master=System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        String db="LegacyVault_RecoveryBinding_"+UUID.randomUUID().toString().replace("-","");
        String url=master.replace("databaseName=master;","databaseName="+db+";");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()) { s.execute("CREATE DATABASE ["+db+"]"); }
        try {
            Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("40").load().migrate();
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                s.executeUpdate("INSERT dbo.users(full_name,email,password_hash,status) VALUES ('Fixture','migration@example.test','preserved-hash','ACTIVE')");
                s.execute("CREATE TRIGGER recovery_binding_failure ON DATABASE FOR CREATE_INDEX AS BEGIN IF EVENTDATA().value('(/EVENT_INSTANCE/TSQLCommand/CommandText)[1]','nvarchar(max)') LIKE '%IX_recovery_limit%' THROW 51440,'Injected fixture migration failure',1; END");
            }
            var upgrade=Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").load();
            assertThrows(RuntimeException.class,upgrade::migrate);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.users') AND name IN ('auth_version','password_reset_at','password_login_enabled')")) { assertTrue(r.next()); assertEquals(0,r.getInt(1)); }
                try(var r=s.executeQuery("SELECT COUNT(*) FROM sys.tables WHERE name IN ('password_reset_credentials','password_recovery_jobs','password_recovery_limits')")) { assertTrue(r.next()); assertEquals(0,r.getInt(1)); }
                try(var r=s.executeQuery("SELECT COUNT(*) FROM dbo.flyway_schema_history WHERE version='41'")) { assertTrue(r.next()); assertEquals(0,r.getInt(1)); }
                try(var r=s.executeQuery("SELECT COUNT(*) FROM dbo.flyway_schema_history WHERE version='40' AND success=1")) { assertTrue(r.next()); assertEquals(1,r.getInt(1)); }
                s.execute("DROP TRIGGER recovery_binding_failure ON DATABASE");
            }
            upgrade.migrate(); upgrade.validate(); assertEquals(0,upgrade.migrate().migrationsExecuted);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT password_hash,auth_version,status,password_login_enabled FROM dbo.users")) {
                    assertTrue(r.next()); assertEquals("preserved-hash",r.getString(1)); assertEquals(0,r.getLong(2)); assertEquals("ACTIVE",r.getString(3)); assertNull(r.getObject(4));
                }
                s.executeUpdate("INSERT dbo.password_recovery_jobs(email,locale,requested_at,status) VALUES ('migration@example.test','vi',SYSUTCDATETIME(),'CLAIMED')");
                assertEquals(1,s.executeUpdate("UPDATE dbo.password_recovery_jobs SET status='PREPARED' WHERE status='CLAIMED'"));
                assertThrows(java.sql.SQLException.class,()->s.executeUpdate("INSERT dbo.password_reset_credentials(user_id,credential_hash,auth_version,created_at,expires_at) SELECT user_id,REPLICATE('c',64),0,SYSUTCDATETIME(),DATEADD(minute,15,SYSUTCDATETIME()) FROM dbo.users"));
                s.executeUpdate("INSERT dbo.password_reset_credentials(user_id,credential_hash,email_fingerprint,auth_version,created_at,expires_at) SELECT user_id,REPLICATE('a',64),REPLICATE('b',64),0,SYSUTCDATETIME(),DATEADD(minute,15,SYSUTCDATETIME()) FROM dbo.users");
                // The controlled rollback protocol revokes outstanding links before starting older code.
                s.executeUpdate("UPDATE dbo.password_reset_credentials SET revoked_at=SYSUTCDATETIME() WHERE consumed_at IS NULL AND revoked_at IS NULL");
                assertEquals(0,s.executeUpdate("UPDATE dbo.password_reset_credentials SET consumed_at=SYSUTCDATETIME() WHERE consumed_at IS NULL AND revoked_at IS NULL AND expires_at>SYSUTCDATETIME()"));
            }
        } finally {
            if(!db.matches("LegacyVault_RecoveryBinding_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe fixture name");
            try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {
                s.execute("ALTER DATABASE ["+db+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE"); s.execute("DROP DATABASE ["+db+"]");
            }
        }
    }
}
