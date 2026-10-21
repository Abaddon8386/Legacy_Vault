package com.legacyvault.verification;

import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL", matches=".*databaseName=master;.*")
class InvitationMigrationUpgradeSqlServerTest {
    @Test void upgradeFromV33KeepsExistingBeneficiaryLinkAndMigrationHistory() throws Exception {
        String master = System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        String database = "LegacyVault_InvitationUpgrade_" + UUID.randomUUID().toString().replace("-", "");
        String url = master.replace("databaseName=master;", "databaseName="+database+";");
        try (var c = DriverManager.getConnection(master); var s = c.createStatement()) {
            s.execute("CREATE DATABASE ["+database+"]");
        }
        try {
            Flyway.configure().dataSource(url, null, null).locations("classpath:db/migration").target("33").load().migrate();
            try (var c = DriverManager.getConnection(url); var s = c.createStatement()) {
                s.executeUpdate("INSERT dbo.users(full_name,email,password_hash,status) VALUES ('Owner','owner@upgrade.test','unused','ACTIVE'),('Recipient','recipient@upgrade.test','unused','ACTIVE')");
                s.executeUpdate("INSERT dbo.vaults(owner_user_id,vault_name) SELECT user_id,'Preserved vault' FROM dbo.users WHERE email='owner@upgrade.test'");
                s.executeUpdate("INSERT dbo.beneficiaries(vault_id,full_name,linked_user_id,account_status,id_verification_status) SELECT v.vault_id,'Preserved beneficiary',u.user_id,'ACCOUNT_CREATED','VERIFIED_AT_COUNTER' FROM dbo.vaults v CROSS JOIN dbo.users u WHERE u.email='recipient@upgrade.test'");
            }
            var flyway = Flyway.configure().dataSource(url, null, null).locations("classpath:db/migration").load();
            assertEquals(1, flyway.migrate().migrationsExecuted); flyway.validate();
            assertEquals(0, flyway.migrate().migrationsExecuted);
            try (var c = DriverManager.getConnection(url); var s = c.createStatement();
                 var r = s.executeQuery("SELECT b.full_name,b.account_status,b.id_verification_status,u.email FROM dbo.beneficiaries b JOIN dbo.users u ON u.user_id=b.linked_user_id")) {
                assertTrue(r.next()); assertEquals("Preserved beneficiary", r.getString(1));
                assertEquals("ACCOUNT_CREATED", r.getString(2)); assertEquals("VERIFIED_AT_COUNTER", r.getString(3));
                assertEquals("recipient@upgrade.test", r.getString(4)); assertFalse(r.next());
            }
            try (var c = DriverManager.getConnection(url); var s = c.createStatement();
                 var r = s.executeQuery("SELECT COUNT(*) FROM dbo.beneficiary_invitations")) {
                assertTrue(r.next()); assertEquals(0, r.getInt(1));
            }
        } finally {
            if (!database.matches("LegacyVault_InvitationUpgrade_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe test database");
            try (var c = DriverManager.getConnection(master); var s = c.createStatement()) {
                s.execute("ALTER DATABASE ["+database+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");
                s.execute("DROP DATABASE ["+database+"]");
            }
        }
    }
}
