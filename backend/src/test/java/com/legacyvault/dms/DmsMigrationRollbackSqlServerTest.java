package com.legacyvault.dms;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.DriverManager;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class DmsMigrationRollbackSqlServerTest {
    @Test void failedV36RollsBackAllDdlAndMinuteRowsCannotBeSilentlyDowngraded() throws Exception {
        String master=System.getenv("LEGAL_SQLSERVER_MASTER_URL");String db="LegacyVault_DmsMinuteFailure_"+UUID.randomUUID().toString().replace("-","");
        String url=master.replace("databaseName=master;","databaseName="+db+";");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()){s.execute("CREATE DATABASE ["+db+"]");}
        try {
            Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("33").load().migrate();
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                s.executeUpdate("INSERT dbo.users(full_name,email,password_hash,status) VALUES('Failure fixture','failure@example.test','unused','ACTIVE')");
                s.executeUpdate("INSERT dbo.dms_configs(owner_user_id,check_interval_days,grace_period_days,status,next_check_at) SELECT user_id,2,1,'MONITORING','2026-10-22T12:00:00' FROM dbo.users WHERE email='failure@example.test'");
                s.execute("ALTER TABLE dbo.dms_configs ADD CONSTRAINT CK_dms_minute_interval CHECK(grace_period_days>0)");
            }
            var upgrade=Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("36").load();
            assertThrows(RuntimeException.class,upgrade::migrate);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.dms_configs') AND name='check_interval_minutes'")){assertTrue(r.next());assertEquals(0,r.getInt(1));}
                try(var r=s.executeQuery("SELECT is_nullable FROM sys.columns WHERE object_id=OBJECT_ID('dbo.dms_configs') AND name='check_interval_days'")){assertTrue(r.next());assertFalse(r.getBoolean(1));}
                try(var r=s.executeQuery("SELECT COUNT(*) FROM dbo.flyway_schema_history WHERE version='36'")){assertTrue(r.next());assertEquals(0,r.getInt(1));}
                try(var r=s.executeQuery("SELECT check_interval_days,next_check_at FROM dbo.dms_configs")){assertTrue(r.next());assertEquals(2,r.getInt(1));assertEquals(java.time.LocalDateTime.parse("2026-10-22T12:00:00"),r.getObject(2,java.time.LocalDateTime.class));}
                s.execute("ALTER TABLE dbo.dms_configs DROP CONSTRAINT CK_dms_minute_interval");
            }
            upgrade.migrate();upgrade.validate();assertEquals(0,upgrade.migrate().migrationsExecuted);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                s.executeUpdate("UPDATE dbo.dms_configs SET check_interval_days=NULL,check_interval_minutes=90");
                assertThrows(java.sql.SQLException.class,()->s.executeUpdate("UPDATE dbo.dms_configs SET check_interval_days=1,next_check_at='2026-10-23T12:00:00'"));
                try(var r=s.executeQuery("SELECT check_interval_days,check_interval_minutes,next_check_at FROM dbo.dms_configs")){assertTrue(r.next());assertNull(r.getObject(1));assertEquals(90,r.getInt(2));assertEquals(java.time.LocalDateTime.parse("2026-10-22T12:00:00"),r.getObject(3,java.time.LocalDateTime.class));}
            }
        } finally {
            if(!db.matches("LegacyVault_DmsMinuteFailure_[a-f0-9]{32}"))throw new IllegalStateException("Unsafe fixture name");
            try(var c=DriverManager.getConnection(master);var s=c.createStatement()){s.execute("ALTER DATABASE ["+db+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");s.execute("DROP DATABASE ["+db+"]");}
        }
    }
}
