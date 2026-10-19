package com.legacyvault.verification;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Targeted SQL Server regression for V30 trigger actions and OUTPUT INSERTED.
 * Uses four representative minimal tables and the ACTUAL V30 trigger definitions.
 * This is not a full Flyway/JPA migration test and does not modify or bypass V25 in the application.
 */
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class V30InsertOutputSqlServerTest {
    private static final Map<String,String> TABLES=Map.of("assets","asset_id","beneficiaries","beneficiary_id",
            "trustees","trustee_id","verification_cases","verification_case_id");
    private static String database;
    private static String masterUrl;
    private static String databaseUrl;

    @BeforeAll static void createDatabase() throws Exception {
        masterUrl=System.getenv("LEGAL_SQLSERVER_MASTER_URL");
        database="LegacyVault_V30Trigger_"+UUID.randomUUID().toString().replace("-","");
        databaseUrl=masterUrl.replace("databaseName=master;","databaseName="+database+";");
        try(var c=DriverManager.getConnection(masterUrl);var s=c.createStatement()){
            s.execute("CREATE DATABASE ["+database+"]");
        }
        try(var c=DriverManager.getConnection(databaseUrl);var s=c.createStatement()){
            s.execute("CREATE TABLE dbo.vaults(vault_id BIGINT IDENTITY PRIMARY KEY,status nvarchar(40) NOT NULL)");
            for(var e:TABLES.entrySet())s.execute("CREATE TABLE dbo."+e.getKey()+"("+e.getValue()+
                    " BIGINT IDENTITY PRIMARY KEY,vault_id BIGINT NOT NULL REFERENCES dbo.vaults(vault_id),label nvarchar(100) NOT NULL)");
            String sql;
            try(var in=V30InsertOutputSqlServerTest.class.getResourceAsStream("/db/migration/V30__archived_vault_read_only.sql")){
                assertNotNull(in);
                sql=new String(in.readAllBytes(),StandardCharsets.UTF_8);
            }
            int applied=0;
            for(var batch:sql.split("(?im)^GO\\s*$")){
                for(var table:TABLES.keySet()){
                    String declaration="CREATE TRIGGER dbo.TR_archive_guard_"+table+" ";
                    if(batch.stripLeading().startsWith(declaration)){s.execute(batch);applied++;}
                }
            }
            assertEquals(4,applied,"Run the original V30 trigger definitions, not a test-only replacement");
        }catch(Throwable failure){
            dropDatabase();
            throw failure;
        }
    }
    @AfterAll static void dropDatabase() throws Exception {
        if(database==null)return;
        if(!database.matches("LegacyVault_V30Trigger_[a-f0-9]{32}"))throw new IllegalStateException("Unsafe fixture DB name");
        try(var c=DriverManager.getConnection(masterUrl);var s=c.createStatement()){
            s.execute("ALTER DATABASE ["+database+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");
            s.execute("DROP DATABASE ["+database+"]");
        }finally{database=null;}
    }
    private static long vault(Connection c,String status)throws SQLException{
        try(var s=c.prepareStatement("INSERT dbo.vaults(status) OUTPUT inserted.vault_id VALUES (?)")){
            s.setString(1,status);try(var r=s.executeQuery()){assertTrue(r.next());return r.getLong(1);}
        }
    }
    @Test void outputInsertedWorksForEveryRepresentativeProtectedTable()throws Exception{
        try(var c=DriverManager.getConnection(databaseUrl)){
            long id=vault(c,"ACTIVE");
            for(var e:TABLES.entrySet()){
                try(var s=c.prepareStatement("INSERT dbo."+e.getKey()+
                        "(vault_id,label) OUTPUT inserted.* VALUES (?,?)")){
                    s.setLong(1,id);s.setString(2,"normal insert");
                    try(var r=s.executeQuery()){
                        assertTrue(r.next());assertTrue(r.getLong(e.getValue())>0);
                        assertEquals(id,r.getLong("vault_id"));assertFalse(r.next());
                    }
                }
            }
        }
    }
    @Test void archivedUpdatesAndDeletesRemainBlocked()throws Exception{
        try(var c=DriverManager.getConnection(databaseUrl);var s=c.createStatement()){
            long id=vault(c,"ACTIVE");
            for(var table:TABLES.keySet())s.executeUpdate("INSERT dbo."+table+"(vault_id,label) VALUES ("+id+",N'before archive')");
            s.executeUpdate("UPDATE dbo.vaults SET status=N'ARCHIVED' WHERE vault_id="+id);
            for(var table:TABLES.keySet()){
                SQLException update=assertThrows(SQLException.class,()->s.executeUpdate(
                        "UPDATE dbo."+table+" SET label=N'changed' WHERE vault_id="+id));
                assertEquals(51300,update.getErrorCode());
                SQLException delete=assertThrows(SQLException.class,()->s.executeUpdate(
                        "DELETE dbo."+table+" WHERE vault_id="+id));
                assertEquals(51300,delete.getErrorCode());
            }
        }
    }
    @Test void noInsertTriggerAndRawInsertIsIntentionallyServiceResponsibility()throws Exception{
        try(var c=DriverManager.getConnection(databaseUrl);var s=c.createStatement()){
            try(var events=s.executeQuery("SELECT COUNT(*) FROM sys.trigger_events e JOIN sys.triggers t ON t.object_id=e.object_id WHERE t.name LIKE 'TR_archive_guard_%' AND e.type_desc='INSERT'")){
                assertTrue(events.next());assertEquals(0,events.getInt(1));
            }
            long id=vault(c,"ARCHIVED");
            // Documents the intended boundary: direct SQL is not a supported write API.
            for(var table:TABLES.keySet())assertEquals(1,s.executeUpdate(
                    "INSERT dbo."+table+"(vault_id,label) VALUES ("+id+",N'raw SQL has no service guard')"));
        }
    }
}
