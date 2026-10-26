package com.legacyvault.verification;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.DriverManager;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class AdminAuditMigrationSqlServerTest {
    @Test void additivePublicIdentityPreservesOldEventsAndFutureWriterDefaults() throws Exception {
        String master=System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        String database="LegacyVault_AdminAuditUpgrade_"+UUID.randomUUID().toString().replace("-","");
        String url=master.replace("databaseName=master;","databaseName="+database+";");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()){s.execute("CREATE DATABASE ["+database+"]");}
        try {
            Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("33").load().migrate();
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                s.executeUpdate("INSERT dbo.audit_logs(action,entity_type,occurred_at,details,state_before,state_after) VALUES('AUTH_LOGIN_FAILED','USER','2025-01-01',N'{\"fixture\":\"preserve\"}',N'{\"status\":\"before\"}',N'{\"status\":\"after\"}')");
            }
            var flyway=Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").load();flyway.migrate();flyway.validate();assertEquals(0,flyway.migrate().migrationsExecuted);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT action,details,state_before,state_after,CONVERT(varchar(36),public_id),occurred_at FROM dbo.audit_logs")) {
                    assertTrue(r.next());assertEquals("AUTH_LOGIN_FAILED",r.getString(1));assertEquals("{\"fixture\":\"preserve\"}",r.getString(2));
                    assertEquals("{\"status\":\"before\"}",r.getString(3));assertEquals("{\"status\":\"after\"}",r.getString(4));assertNotNull(UUID.fromString(r.getString(5)));
                    assertEquals(java.time.LocalDate.of(2025,1,1),r.getTimestamp(6).toLocalDateTime().toLocalDate());assertFalse(r.next());
                }
                s.executeUpdate("INSERT dbo.audit_logs(action,entity_type) VALUES('AUTH_LOGIN_FAILED','USER')");
                try(var r=s.executeQuery("SELECT COUNT(DISTINCT public_id) FROM dbo.audit_logs")){assertTrue(r.next());assertEquals(2,r.getInt(1));}
                assertThrows(java.sql.SQLException.class,()->s.executeUpdate("UPDATE dbo.audit_logs SET action='AUTH_REGISTERED'"));
                assertThrows(java.sql.SQLException.class,()->s.executeUpdate("DELETE dbo.audit_logs"));
            }
        } finally {
            if(!database.matches("LegacyVault_AdminAuditUpgrade_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe fixture name");
            try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {s.execute("ALTER DATABASE ["+database+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");s.execute("DROP DATABASE ["+database+"]");}
        }
    }
}
