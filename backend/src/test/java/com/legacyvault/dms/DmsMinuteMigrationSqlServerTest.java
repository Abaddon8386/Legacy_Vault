package com.legacyvault.dms;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.sql.DriverManager;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class DmsMinuteMigrationSqlServerTest {
    @Test void upgradePreservesLegacyAndArchivedDurationsAndEveryTimestamp() throws Exception {
        String master=System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        String database="LegacyVault_DmsMinuteUpgrade_"+UUID.randomUUID().toString().replace("-","");
        String url=master.replace("databaseName=master;","databaseName="+database+";");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {s.execute("CREATE DATABASE ["+database+"]");}
        try {
            Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("33").load().migrate();
            var jdbc=new JdbcTemplate(new DriverManagerDataSource(url));
            for(String status:new String[]{"ACTIVE","ARCHIVED"}) {
                String email=UUID.randomUUID()+"@example.test";
                long owner=jdbc.queryForObject("INSERT dbo.users(full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES('Upgrade minute',?,'unused','ACTIVE')",Long.class,email);
                jdbc.update("INSERT dbo.vaults(owner_user_id,vault_name,status) VALUES(?,'Upgrade minute',?)",owner,status);
                jdbc.update("INSERT dbo.dms_configs(owner_user_id,check_interval_days,grace_period_days,status,last_check_in_at,next_check_at,updated_at) VALUES(?,32767,7,'MONITORING','2026-01-01T10:11:12','2115-09-18T10:11:12','2026-01-01T10:11:12')",owner);
            }
            String fields="SELECT owner_user_id,check_interval_days,grace_period_days,status,last_check_in_at,next_check_at,triggered_at,grace_period_ends_at,updated_at FROM dbo.dms_configs ORDER BY dms_id";
            var before=jdbc.queryForList(fields);
            var flyway=Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").load();
            assertTrue(flyway.migrate().migrationsExecuted>=1);flyway.validate();assertEquals(0,flyway.migrate().migrationsExecuted);
            assertEquals(before,jdbc.queryForList(fields));
            assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.dms_configs WHERE check_interval_minutes IS NULL AND check_interval_days*1440=47184480",Integer.class));
            long owner=jdbc.queryForObject("SELECT owner_user_id FROM dbo.vaults WHERE status='ACTIVE'",Long.class);
            assertThrows(org.springframework.dao.DataAccessException.class,()->jdbc.update("UPDATE dbo.dms_configs SET check_interval_days=1,check_interval_minutes=90 WHERE owner_user_id=?",owner));
            assertThrows(org.springframework.dao.DataAccessException.class,()->jdbc.update("UPDATE dbo.dms_configs SET check_interval_days=NULL,check_interval_minutes=NULL WHERE owner_user_id=?",owner));
        } finally {
            if(!database.matches("LegacyVault_DmsMinuteUpgrade_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe DB cleanup");
            try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {s.execute("ALTER DATABASE ["+database+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");s.execute("DROP DATABASE ["+database+"]");}
        }
    }
}
