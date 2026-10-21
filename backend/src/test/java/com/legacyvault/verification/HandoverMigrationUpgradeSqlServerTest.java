package com.legacyvault.verification;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.sql.DriverManager;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Real V27 -> current upgrade in a disposable database; no repair or existing DB access. */
@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class HandoverMigrationUpgradeSqlServerTest {
    @Test
    void upgradePreservesExistingVaultAndValidatesAllMigrations() throws Exception {
        String master = System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        String database = "LegacyVault_HandoverUpgrade_" + UUID.randomUUID().toString().replace("-", "");
        String url = master.replace("databaseName=master;", "databaseName=" + database + ";");
        try (var c = DriverManager.getConnection(master); var s = c.createStatement()) {
            s.execute("CREATE DATABASE [" + database + "]");
        }
        try {
            Flyway.configure().dataSource(url, null, null).locations("classpath:db/migration")
                    .target("27").load().migrate();
            long vaultId;
            try (var c = DriverManager.getConnection(url); var s = c.createStatement()) {
                s.executeUpdate("INSERT dbo.users(full_name,email,password_hash,status) VALUES ('Upgrade fixture','upgrade@example.test','unused','ACTIVE')");
                try (var r = s.executeQuery("INSERT dbo.vaults(owner_user_id,vault_name,status) OUTPUT inserted.vault_id SELECT user_id,'Preserved vault','ACTIVE' FROM dbo.users WHERE email='upgrade@example.test'")) {
                    assertTrue(r.next());
                    vaultId = r.getLong(1);
                }
            }
            var flyway = Flyway.configure().dataSource(url, null, null)
                    .locations("classpath:db/migration").load();
            assertEquals(7, flyway.migrate().migrationsExecuted); // V28 through V34, without editing applied migrations.
            flyway.validate();
            assertEquals(0, flyway.migrate().migrationsExecuted);
            try (var c = DriverManager.getConnection(url); var s = c.createStatement();
                 var r = s.executeQuery("SELECT vault_name,status FROM dbo.vaults WHERE vault_id=" + vaultId)) {
                assertTrue(r.next());
                assertEquals("Preserved vault", r.getString(1));
                assertEquals("ACTIVE", r.getString(2));
                assertFalse(r.next());
            }
        } finally {
            if (!database.matches("LegacyVault_HandoverUpgrade_[a-f0-9]{32}")) {
                throw new IllegalStateException("Unsafe test database name");
            }
            try (var c = DriverManager.getConnection(master); var s = c.createStatement()) {
                s.execute("ALTER DATABASE [" + database + "] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");
                s.execute("DROP DATABASE [" + database + "]");
            }
        }
    }
}
