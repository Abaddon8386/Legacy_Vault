package com.legacyvault.verification;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.DriverManager;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class AdminAuditMigrationFailureSqlServerTest {
    @Test void indexFailureRollsBackPublicIdAndUniqueIndexWithoutChangingOldAudit() throws Exception {
        String master=System.getenv("LEGAL_SQLSERVER_MASTER_URL");String db="LegacyVault_AuditFailure_"+UUID.randomUUID().toString().replace("-","");
        String url=master.replace("databaseName=master;","databaseName="+db+";");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()){s.execute("CREATE DATABASE ["+db+"]");}
        try {
            Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("33").load().migrate();
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                s.executeUpdate("INSERT dbo.audit_logs(action,entity_type,occurred_at,details) VALUES('AUTH_LOGIN_FAILED','USER','2026-01-01',N'{\"fixture\":\"preserve\"}')");
                s.execute("CREATE INDEX IX_audit_logs_admin_time ON dbo.audit_logs(action)");
            }
            var upgrade=Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").load();assertThrows(RuntimeException.class,upgrade::migrate);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.audit_logs') AND name='public_id'")){assertTrue(r.next());assertEquals(0,r.getInt(1));}
                try(var r=s.executeQuery("SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.audit_logs') AND name='UX_audit_logs_public_id'")){assertTrue(r.next());assertEquals(0,r.getInt(1));}
                try(var r=s.executeQuery("SELECT COUNT(*) FROM dbo.flyway_schema_history WHERE version='37'")){assertTrue(r.next());assertEquals(0,r.getInt(1));}
                try(var r=s.executeQuery("SELECT action,details,occurred_at FROM dbo.audit_logs")){assertTrue(r.next());assertEquals("AUTH_LOGIN_FAILED",r.getString(1));assertEquals("{\"fixture\":\"preserve\"}",r.getString(2));assertEquals(java.time.LocalDateTime.parse("2026-01-01T00:00:00"),r.getObject(3,java.time.LocalDateTime.class));assertFalse(r.next());}
                s.execute("DROP INDEX IX_audit_logs_admin_time ON dbo.audit_logs");
            }
            upgrade.migrate();upgrade.validate();assertEquals(0,upgrade.migrate().migrationsExecuted);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                assertThrows(java.sql.SQLException.class,()->s.executeUpdate("UPDATE dbo.audit_logs SET action='AUTH_REGISTERED'"));
                assertThrows(java.sql.SQLException.class,()->s.executeUpdate("DELETE dbo.audit_logs"));
                s.executeUpdate("INSERT dbo.audit_logs(action,entity_type) VALUES('AUTH_LOGIN_FAILED','USER')");
                try(var r=s.executeQuery("SELECT COUNT(DISTINCT public_id) FROM dbo.audit_logs")){assertTrue(r.next());assertEquals(2,r.getInt(1));}
            }
        } finally {
            if(!db.matches("LegacyVault_AuditFailure_[a-f0-9]{32}"))throw new IllegalStateException("Unsafe fixture name");
            try(var c=DriverManager.getConnection(master);var s=c.createStatement()){s.execute("ALTER DATABASE ["+db+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");s.execute("DROP DATABASE ["+db+"]");}
        }
    }
}
