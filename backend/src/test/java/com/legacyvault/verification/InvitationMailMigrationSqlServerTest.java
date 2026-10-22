package com.legacyvault.verification;

import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class InvitationMailMigrationSqlServerTest {
    @Test void v49UpgradePreservesCiphertextAndHistoryAndFailedV50RollsBackWithoutRepair() throws Exception {
        String master=System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        String database="LegacyVault_MailUpgrade_"+UUID.randomUUID().toString().replace("-","");
        String url=master.replace("databaseName=master;","databaseName="+database+";");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()){s.execute("CREATE DATABASE ["+database+"]");}
        try {
            Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("49").load().migrate();
            String checksum;
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT checksum FROM dbo.flyway_schema_history WHERE version='46'")){assertTrue(r.next());checksum=r.getString(1);}
                s.executeUpdate("INSERT dbo.users(full_name,email,password_hash,status) VALUES ('Mail upgrade','mail-upgrade@example.test','unused','ACTIVE')");
                s.executeUpdate("INSERT dbo.vaults(owner_user_id,vault_name) SELECT user_id,'Preserved vault' FROM dbo.users WHERE email='mail-upgrade@example.test'");
                s.executeUpdate("INSERT dbo.beneficiaries(vault_id,full_name) SELECT vault_id,'Preserved beneficiary' FROM dbo.vaults");
                s.executeUpdate("INSERT dbo.beneficiary_invitations(public_id,beneficiary_id,generation,is_current,code_hash,issued_at,expires_at,issued_by_user_id) SELECT NEWID(),b.beneficiary_id,1,1,REPLICATE('a',64),SYSUTCDATETIME(),DATEADD(day,7,SYSUTCDATETIME()),v.owner_user_id FROM dbo.beneficiaries b JOIN dbo.vaults v ON v.vault_id=b.vault_id");
                s.executeUpdate("INSERT dbo.beneficiary_invitation_mail_outbox(public_id,beneficiary_id,invitation_id,invitation_public_id,request_generation,invitation_generation,payload_ciphertext,payload_iv,key_version) SELECT NEWID(),beneficiary_id,invitation_id,public_id,0,1,0x010203,0x000000000000000000000000,'v1' FROM dbo.beneficiary_invitations");
                // Force failure after the column/constraint statements: all V50 effects must roll back.
                s.execute("CREATE INDEX IX_invitation_mail_claim ON dbo.beneficiary_invitation_mail_outbox(outbox_id)");
            }
            var flyway=Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").load();
            assertThrows(RuntimeException.class,flyway::migrate);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT COL_LENGTH('dbo.beneficiary_invitation_mail_outbox','verification_case_id')")){assertTrue(r.next());assertNull(r.getObject(1));}
                try(var r=s.executeQuery("SELECT COUNT(*) FROM dbo.flyway_schema_history WHERE version='50'")){assertTrue(r.next());assertEquals(0,r.getInt(1));}
                s.execute("DROP INDEX IX_invitation_mail_claim ON dbo.beneficiary_invitation_mail_outbox");
            }
            assertEquals(1,flyway.migrate().migrationsExecuted);flyway.validate();assertEquals(0,flyway.migrate().migrationsExecuted);
            try(var c=DriverManager.getConnection(url);var s=c.createStatement()) {
                try(var r=s.executeQuery("SELECT checksum FROM dbo.flyway_schema_history WHERE version='46'")){assertTrue(r.next());assertEquals(checksum,r.getString(1));}
                try(var r=s.executeQuery("SELECT payload_ciphertext,transport_status,verification_case_id,requested_by_user_id FROM dbo.beneficiary_invitation_mail_outbox")) {
                    assertTrue(r.next());assertArrayEquals(new byte[]{1,2,3},r.getBytes(1));assertEquals("QUEUED",r.getString(2));assertNull(r.getObject(3));assertNull(r.getObject(4));assertFalse(r.next());
                }
            }
        } finally {
            if(!database.matches("LegacyVault_MailUpgrade_[a-f0-9]{32}"))throw new IllegalStateException("Unsafe test database");
            try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {
                s.execute("ALTER DATABASE ["+database+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");s.execute("DROP DATABASE ["+database+"]");
            }
        }
    }
}
