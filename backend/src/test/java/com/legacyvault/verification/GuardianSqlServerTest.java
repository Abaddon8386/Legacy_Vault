package com.legacyvault.verification;

import com.legacyvault.LegacyvaultBackendApplication;
import com.legacyvault.beneficiary.*;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.security.CustomUserPrincipal;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import java.sql.DriverManager;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class GuardianSqlServerTest {
    static String master,db; static ConfigurableApplicationContext app; static JdbcTemplate jdbc; static GuardianService service;
    UUID userId,vaultId,beneficiaryId; long user;
    @BeforeAll static void start() throws Exception {
        master=System.getenv("LEGAL_SQLSERVER_MASTER_URL"); db="LegacyVault_Guardian_"+UUID.randomUUID().toString().replace("-","");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {s.execute("CREATE DATABASE ["+db+"]");}
        String key=Base64.getEncoder().encodeToString(new byte[32]);
        try {
            app=new SpringApplicationBuilder(LegacyvaultBackendApplication.class).initializers(ctx->ctx.addBeanFactoryPostProcessor(factory->{
                var registry=(org.springframework.beans.factory.support.BeanDefinitionRegistry)factory;
                String name=org.springframework.scheduling.config.TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME;
                if(registry.containsBeanDefinition(name)) registry.removeBeanDefinition(name);
            })).run("--spring.datasource.url="+master.replace("databaseName=master;","databaseName="+db+";"),"--server.port=0",
                    "--legacyvault.jwt.secret="+key,"--legacyvault.encryption.key="+key,"--logging.level.root=ERROR",
                    "--logging.level.org.springframework.security=ERROR","--logging.level.org.flywaydb=ERROR");
            jdbc=app.getBean(JdbcTemplate.class); service=app.getBean(GuardianService.class);
        } catch(Throwable failure) {stop(); throw failure;}
    }
    @AfterAll static void stop() throws Exception {
        if(app!=null) {app.close(); app=null;}
        if(db==null) return;
        if(!db.matches("LegacyVault_Guardian_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe fixture");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {
            s.execute("ALTER DATABASE ["+db+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");s.execute("DROP DATABASE ["+db+"]");
        } finally {db=null;}
    }
    @BeforeEach void seed() {
        userId=UUID.randomUUID(); vaultId=UUID.randomUUID(); beneficiaryId=UUID.randomUUID();
        user=jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES(?,'Guardian fixture',?,'unused','ACTIVE')",Long.class,userId.toString(),userId+"@example.test");
        long vault=jdbc.queryForObject("INSERT dbo.vaults(public_id,owner_user_id,vault_name,status) OUTPUT inserted.vault_id VALUES(?,?,'Fixture','ACTIVE')",Long.class,vaultId.toString(),user);
        jdbc.update("INSERT dbo.beneficiaries(public_id,vault_id,full_name,date_of_birth) VALUES(?,?,'Minor',?)",beneficiaryId.toString(),vault,LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).minusYears(10));
        authenticate();
    }
    void authenticate() {SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
            new CustomUserPrincipal(user,userId,userId+"@example.test"),null,List.of(new SimpleGrantedAuthority("ROLE_VAULT_OWNER"))));}
    @AfterEach void clear() {SecurityContextHolder.clearContext();}
    GuardianDtos.UpsertRequest request(long revision) {return new GuardianDtos.UpsertRequest(revision,"Synthetic guardian","Parent","contact@example.test",null);}
    @Test void persistsHistoryAndDoesNotAlterInvitationOrRightsOnDobChange() {
        assertEquals("BENEFICIARY_GUARDIAN_RECOMMENDED",service.read(vaultId,beneficiaryId).warningCode());
        var saved=service.replace(vaultId,beneficiaryId,request(0)); assertEquals(1,saved.revision());
        assertEquals("contact@example.test",service.read(vaultId,beneficiaryId).guardian().email());
        service.replace(vaultId,beneficiaryId,request(1));
        assertEquals("REPLACED",service.history(vaultId,beneficiaryId,0,20).content().get(1).endReason());
        jdbc.update("UPDATE dbo.beneficiaries SET date_of_birth=? WHERE public_id=?",LocalDate.of(1990,1,1),beneficiaryId.toString());
        assertEquals("ADULT",service.read(vaultId,beneficiaryId).ageStatus());
        assertNotNull(service.read(vaultId,beneficiaryId).guardian());
        service.revoke(vaultId,beneficiaryId,new GuardianDtos.RevokeRequest(2L));
        assertNull(service.read(vaultId,beneficiaryId).guardian());
        assertEquals(2,service.history(vaultId,beneficiaryId,0,20).totalElements());
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.beneficiaries WHERE public_id=? AND linked_user_id IS NOT NULL",Integer.class,beneficiaryId.toString()));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.user_roles WHERE user_id=?",Integer.class,user));
    }
    @Test void staleAndCrossVaultAreRejectedAndAuditFailureRollsBack() {
        assertThrows(BusinessException.class,()->service.read(UUID.randomUUID(),beneficiaryId));
        assertThrows(BusinessException.class,()->service.replace(vaultId,UUID.randomUUID(),request(0)));
        service.replace(vaultId,beneficiaryId,request(0));
        assertThrows(BusinessException.class,()->service.replace(vaultId,beneficiaryId,request(0)));
        jdbc.execute("CREATE TRIGGER dbo.guardian_test_audit_failure ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='BENEFICIARY_GUARDIAN_RECORDED') THROW 51000,'Injected guardian audit failure',1; END");
        try {assertThrows(RuntimeException.class,()->service.replace(vaultId,beneficiaryId,request(1)));}
        finally {jdbc.execute("DROP TRIGGER dbo.guardian_test_audit_failure");}
        assertEquals(1,service.read(vaultId,beneficiaryId).revision());
        assertEquals(1,service.history(vaultId,beneficiaryId,0,20).totalElements());
        jdbc.update("UPDATE dbo.vaults SET status='ARCHIVED' WHERE public_id=?",vaultId.toString());
        assertNotNull(service.read(vaultId,beneficiaryId).guardian());
        assertThrows(BusinessException.class,()->service.replace(vaultId,beneficiaryId,request(1)));
    }
    @Test void concurrentWritersWithSameRevisionHaveOneWinner() throws Exception {
        var barrier=new CyclicBarrier(2);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Boolean> work=()->{authenticate();try {barrier.await(10,TimeUnit.SECONDS);service.replace(vaultId,beneficiaryId,request(0));return true;}
                catch(BusinessException conflict) {assertEquals("BENEFICIARY_GUARDIAN_STALE",conflict.getErrorCode().name());return false;}
                finally {SecurityContextHolder.clearContext();}};
            var a=pool.submit(work);var b=pool.submit(work);
            assertNotEquals(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS));
        }
        assertEquals(1,service.read(vaultId,beneficiaryId).revision());
        assertEquals(1,service.history(vaultId,beneficiaryId,0,20).totalElements());
    }
}

