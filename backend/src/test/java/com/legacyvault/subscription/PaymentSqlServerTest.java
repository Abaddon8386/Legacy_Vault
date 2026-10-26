package com.legacyvault.subscription;

import com.legacyvault.LegacyvaultBackendApplication;
import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.subscription.service.*;
import com.legacyvault.subscription.service.PaymentService.*;
import com.legacyvault.subscription.dto.SubscriptionDtos.PlanCode;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.config.TaskManagementConfigUtils;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.context.WebApplicationContext;
import java.sql.DriverManager;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real SQL Server, migrations, locks, audit, MVC. Own disposable DB; no application DB access. */
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class PaymentSqlServerTest {
    static String database,master;
    static ConfigurableApplicationContext context;
    static JdbcTemplate jdbc;
    static PaymentService service;
    static OwnerQuotaService quotas;
    static VnPayGateway gateway;
    static MockMvc mvc;
    long owner;
    UUID userPublic;
    @BeforeAll static void start() throws Exception {
        master=System.getenv("LEGAL_SQLSERVER_MASTER_URL");database="LegacyVault_PaymentTest_"+UUID.randomUUID().toString().replace("-","");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()) { s.execute("CREATE DATABASE ["+database+"]"); }
        String url=master.replace("databaseName=master;","databaseName="+database+";");
        try {
            // Exercise upgrade from the existing production schema, preserving existing catalog.
            Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("33").load().migrate();
            String key=Base64.getEncoder().encodeToString(new byte[32]);
            context=new SpringApplicationBuilder(LegacyvaultBackendApplication.class).initializers(app->app.addBeanFactoryPostProcessor(factory->{
                var registry=(BeanDefinitionRegistry)factory;
                String name=TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME;
                if(registry.containsBeanDefinition(name)) registry.removeBeanDefinition(name);
            })).run("--spring.datasource.url="+url,"--server.port=0","--legacyvault.jwt.secret="+key,"--legacyvault.encryption.key="+key,
                "--legacyvault.vnpay.enabled=true","--legacyvault.vnpay.merchant-code=TEST1234",
                "--legacyvault.vnpay.hash-secret=sandbox-test-secret-not-a-real-key","--legacyvault.vnpay.return-url=http://localhost:5173/subscription",
                "--logging.level.root=ERROR","--logging.level.org.springframework.security=ERROR","--logging.level.org.flywaydb=ERROR");
            jdbc=context.getBean(JdbcTemplate.class);service=context.getBean(PaymentService.class);
            quotas=context.getBean(OwnerQuotaService.class);gateway=context.getBean(VnPayGateway.class);
            mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).build();
        } catch(Throwable failure) { stop();throw failure; }
    }
    @AfterAll static void stop() throws Exception {
        if(context!=null) { context.close(); context=null; }
        if(database==null) return;
        if(!database.matches("LegacyVault_PaymentTest_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe DB");
        try(var c=DriverManager.getConnection(master);var s=c.createStatement()) {
            s.execute("ALTER DATABASE ["+database+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");s.execute("DROP DATABASE ["+database+"]");
        } finally { database=null; }
    }
    @Test void queryReconciliationRecoversMissedIpnAndAcceptsValidLateConfirmation() throws Exception {
        var p=create(PlanCode.STANDARD);
        jdbc.update("UPDATE dbo.subscription_payments SET created_at=DATEADD(hour,-1,SYSUTCDATETIME()),expires_at=DATEADD(minute,-45,SYSUTCDATETIME()) WHERE payment_id=?",p.paymentId().toString());
        var response=VnPayQueryGatewayTest.signed(p.paymentId(),Instant.now().minusSeconds(3000),p.amountVnd());
        assertEquals("EXPIRED",service.read(owner,p.paymentId()).status());
        assertEquals("00",service.reconcile(owner,p.paymentId(),response).code());
        assertEquals("SUCCEEDED",service.read(owner,p.paymentId()).status());
        assertEquals("STANDARD",quotas.current(owner).effectivePlan().code());
        assertEquals("02",service.reconcile(owner,p.paymentId(),response).code());
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE action='SUBSCRIPTION_PAYMENT_SUCCEEDED' AND rule_id='VERIFIED_QUERYDR' AND JSON_VALUE(details,'$.paymentId')=?",Integer.class,p.paymentId().toString()));
    }
    @Test void queryReconciliationRejectsTamperingWrongOwnerAmountMerchantStatusAndPaymentTime() throws Exception {
        var p=create(PlanCode.STANDARD);
        var valid=VnPayQueryGatewayTest.signed(p.paymentId(),p.createdAt(),p.amountVnd());
        assertThrows(BusinessException.class,()->service.reconcile(owner+999999,p.paymentId(),valid));
        var tampered=new LinkedHashMap<>(valid);tampered.put("vnp_Amount","100");
        assertEquals("97",service.reconcile(owner,p.paymentId(),tampered).code());
        for(var change:List.of(Map.entry("vnp_Amount","100"),Map.entry("vnp_TmnCode","OTHER123"),
                Map.entry("vnp_TxnRef",UUID.randomUUID().toString().replace("-","")),Map.entry("vnp_TransactionStatus","02"),
                Map.entry("vnp_TransactionType","02"),Map.entry("vnp_ResponseCode","91"),Map.entry("vnp_PayDate","20000101000000"))) {
            var wrong=new LinkedHashMap<>(valid);wrong.put(change.getKey(),change.getValue());VnPayQueryGatewayTest.resign(wrong);
            assertNotEquals("00",service.reconcile(owner,p.paymentId(),wrong).code());
        }
        assertEquals("PENDING",service.read(owner,p.paymentId()).status());assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
    }
    @Test void queryAndIpnRaceGrantAndAuditOnlyOnce() throws Exception {
        var p=create(PlanCode.STANDARD);long account=owner;
        var ipn=callback(p,"00","00");
        var query=VnPayQueryGatewayTest.signed(p.paymentId(),p.createdAt(),p.amountVnd());
        query.put("vnp_TransactionNo",ipn.getFirst("vnp_TransactionNo"));VnPayQueryGatewayTest.resign(query);
        var start=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        try {
            var a=pool.submit(()->{start.await();return service.reconcile(account,p.paymentId(),query).code();});
            var b=pool.submit(()->{start.await();return service.ipn(ipn).code();});start.countDown();
            assertEquals(Set.of("00","02"),Set.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS)));
        } finally {pool.shutdownNow();}
        assertEquals("SUCCEEDED",service.read(owner,p.paymentId()).status());assertEquals("STANDARD",quotas.current(owner).effectivePlan().code());
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE action='SUBSCRIPTION_PAYMENT_SUCCEEDED' AND JSON_VALUE(details,'$.paymentId')=?",Integer.class,p.paymentId().toString()));
    }
    @Test void queryReconciliationRollsBackIfAuditFailsAndCanRetry() throws Exception {
        var p=create(PlanCode.STANDARD);
        var query=VnPayQueryGatewayTest.signed(p.paymentId(),p.createdAt(),p.amountVnd());
        jdbc.execute("CREATE TRIGGER dbo.TR_payment_query_audit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='SUBSCRIPTION_PAYMENT_SUCCEEDED') THROW 51980,'Query audit fixture',1; END");
        try {
            assertThrows(RuntimeException.class,()->service.reconcile(owner,p.paymentId(),query));
            assertEquals("PENDING",service.read(owner,p.paymentId()).status());assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
        } finally {jdbc.execute("DROP TRIGGER dbo.TR_payment_query_audit");}
        assertEquals("00",service.reconcile(owner,p.paymentId(),query).code());assertEquals("STANDARD",quotas.current(owner).effectivePlan().code());
    }
    @BeforeEach void owner() {
        userPublic=UUID.randomUUID();
        owner=jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES(?,'Payment fixture',?,'unused','ACTIVE')",
            Long.class,userPublic.toString(),userPublic+"@example.test");
    }
    CheckoutRequest request(PlanCode code) {
        return new CheckoutRequest(code,jdbc.queryForObject("SELECT catalog_version FROM dbo.subscription_plans WHERE plan_code=?",Integer.class,code.name()),UUID.randomUUID());
    }
    PaymentView create(PlanCode code) { return service.create(owner,request(code),"127.0.0.1"); }
    LinkedMultiValueMap<String,String> callback(PaymentView p,String code,String state) {
        var map=new TreeMap<String,String>();map.put("vnp_TmnCode","TEST1234");map.put("vnp_TxnRef",p.paymentId().toString().replace("-",""));
        map.put("vnp_Amount",Long.toString(p.amountVnd()*100));map.put("vnp_ResponseCode",code);map.put("vnp_TransactionStatus",state);
        map.put("vnp_TransactionNo",Long.toString(Math.abs(UUID.randomUUID().getLeastSignificantBits()%99999999999999L)+1));
        map.put("vnp_PayDate",DateTimeFormatter.ofPattern("uuuuMMddHHmmss").withZone(ZoneId.of("Asia/Ho_Chi_Minh")).format(p.createdAt()));
        var q=new LinkedMultiValueMap<String,String>();map.forEach(q::add);q.add("vnp_SecureHash",gateway.sign(map));return q;
    }
    void resign(LinkedMultiValueMap<String,String> q) {
        q.remove("vnp_SecureHash");q.set("vnp_SecureHash",gateway.sign(q.toSingleValueMap()));
    }
    int count(String condition,Object... args) { return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.subscription_payments WHERE "+condition,Integer.class,args); }
    @Test void basicIsFreeAndPaidPlanRequiresVerifiedIpnAndPersistsSnapshot() {
        assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
        assertEquals(0,quotas.current(owner).effectivePlan().priceVnd());
        var p=create(PlanCode.STANDARD);assertEquals(499000,p.amountVnd());assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
        assertEquals("00",service.ipn(callback(p,"00","00")).code());
        var current=quotas.current(owner);assertEquals("STANDARD",current.effectivePlan().code());assertNull(current.effectiveUntil());assertEquals(50,current.effectivePlan().limits().assetCount());
        var admin=context.getBean(AdminSubscriptionService.class).lookupAccount(userPublic+"@example.test");
        assertEquals("STANDARD",admin.effectivePlanCode());assertEquals(50,admin.assetLimit());assertEquals("VERIFIED_VNPAY_PAYMENT",admin.entitlementStatus());
        try {
            jdbc.update("UPDATE dbo.subscription_plans SET purchase_price_vnd=550000,asset_limit=60 WHERE plan_code='STANDARD'");
            assertEquals(499000,quotas.current(owner).effectivePlan().priceVnd());assertEquals(50,quotas.current(owner).effectivePlan().limits().assetCount());
        } finally { jdbc.update("UPDATE dbo.subscription_plans SET purchase_price_vnd=499000,asset_limit=50 WHERE plan_code='STANDARD'"); }
    }
    @Test void idempotencyStaleCatalogPendingAndDowngradeGuards() {
        var r=request(PlanCode.STANDARD);var p=service.create(owner,r,"127.0.0.1");
        assertEquals(p.paymentId(),service.create(owner,r,"127.0.0.1").paymentId());assertEquals(1,count("owner_user_id=?",owner));
        assertEquals(ErrorCode.PAYMENT_REQUEST_CONFLICT,assertThrows(BusinessException.class,()->create(PlanCode.EXTENDED)).getErrorCode());
        assertThrows(BusinessException.class,()->service.create(owner,new CheckoutRequest(PlanCode.EXTENDED,r.catalogVersion(),r.idempotencyKey()),"127.0.0.1"));
        service.ipn(callback(p,"00","00"));assertThrows(BusinessException.class,()->create(PlanCode.STANDARD));
        assertEquals(ErrorCode.SUBSCRIPTION_CATALOG_STALE,assertThrows(BusinessException.class,
            ()->service.create(owner,new CheckoutRequest(PlanCode.EXTENDED,9999,UUID.randomUUID()),"127.0.0.1")).getErrorCode());
        var extended=create(PlanCode.EXTENDED);assertEquals(999000,extended.amountVnd());service.ipn(callback(extended,"00","00"));
        assertEquals("EXTENDED",quotas.current(owner).effectivePlan().code());assertThrows(BusinessException.class,()->create(PlanCode.STANDARD));
    }
    @Test void untrustedWrongMerchantAmountCurrencyMalformedOrDuplicateDoesNotGrant() {
        var p=create(PlanCode.STANDARD);
        var q=callback(p,"00","00");q.set("vnp_Amount","100");assertEquals("97",service.ipn(q).code());
        resign(q);assertEquals("04",service.ipn(q).code());
        q=callback(p,"00","00");q.set("vnp_TmnCode","OTHER123");resign(q);assertEquals("97",service.ipn(q).code());
        q=callback(p,"00","00");q.set("vnp_CurrCode","USD");resign(q);assertEquals("04",service.ipn(q).code());
        q=callback(p,"00","00");q.add("vnp_TxnRef",p.paymentId().toString());assertEquals("97",service.ipn(q).code());
        q=callback(p,"00","00");q.set("vnp_TransactionNo","0");resign(q);assertEquals("99",service.ipn(q).code());
        q=callback(p,"00","00");q.set("vnp_PayDate","20260230000000");resign(q);assertEquals("99",service.ipn(q).code());
        q=callback(p,"00","00");q.set("vnp_TxnRef",UUID.randomUUID().toString().replace("-",""));resign(q);assertEquals("01",service.ipn(q).code());
        assertEquals("BASIC",quotas.current(owner).effectivePlan().code());assertEquals("PENDING",service.read(owner,p.paymentId()).status());
    }
    @Test void failureIsTerminalDuplicateAndOutOfOrderCallbacksNeverGrant() {
        var p=create(PlanCode.STANDARD);assertEquals("00",service.ipn(callback(p,"24","02")).code());
        assertEquals("02",service.ipn(callback(p,"00","00")).code());assertEquals("FAILED",service.read(owner,p.paymentId()).status());
        assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
        var other=create(PlanCode.STANDARD);assertEquals("99",service.ipn(callback(other,"00","01")).code());assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
        assertEquals("00",service.ipn(callback(other,"00","00")).code());
    }
    @Test void lateCallbackDoesNotDowngradeHigherPaidPlan() {
        var old=create(PlanCode.STANDARD);
        jdbc.update("UPDATE dbo.subscription_payments SET created_at=DATEADD(MINUTE,-20,created_at),expires_at=DATEADD(MINUTE,-20,expires_at) WHERE payment_id=?",old.paymentId().toString());
        old=service.read(owner,old.paymentId());assertEquals("EXPIRED",old.status());
        var newer=create(PlanCode.EXTENDED);service.ipn(callback(newer,"00","00"));
        assertEquals("00",service.ipn(callback(old,"00","00")).code());assertEquals("EXTENDED",quotas.current(owner).effectivePlan().code());
        assertEquals("02",service.ipn(callback(newer,"24","02")).code());
    }
    @Test void callbacksAfterCheckoutWindowDoNotGrant() {
        var p=create(PlanCode.STANDARD);var q=callback(p,"00","00");
        q.set("vnp_PayDate",DateTimeFormatter.ofPattern("uuuuMMddHHmmss").withZone(ZoneId.of("Asia/Ho_Chi_Minh")).format(p.createdAt().minusSeconds(1)));
        resign(q);assertEquals("99",service.ipn(q).code());assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
    }
    @Test void simultaneousCreationReturnsOneOrderAndDuplicateIpnOneSuccessAudit() throws Exception {
        var pool=Executors.newFixedThreadPool(2);
        try {
            var r=request(PlanCode.STANDARD);var start=new CountDownLatch(1);
            var a=pool.submit(()->{start.await();return service.create(owner,r,"127.0.0.1");});
            var b=pool.submit(()->{start.await();return service.create(owner,r,"127.0.0.1");});start.countDown();
            var p=a.get(20,TimeUnit.SECONDS);assertEquals(p.paymentId(),b.get(20,TimeUnit.SECONDS).paymentId());
            var q=callback(p,"00","00");var latch=new CountDownLatch(1);
            var x=pool.submit(()->{latch.await();return service.ipn(q).code();});var y=pool.submit(()->{latch.await();return service.ipn(q).code();});latch.countDown();
            assertEquals(Set.of("00","02"),Set.of(x.get(20,TimeUnit.SECONDS),y.get(20,TimeUnit.SECONDS)));
            assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE action='SUBSCRIPTION_PAYMENT_SUCCEEDED' AND details LIKE ?",Integer.class,"%"+p.paymentId()+"%"));
        } finally { pool.shutdownNow(); }
    }
    @Test void auditFailureRollsBackCreateAndSuccessThenRetryWorks() throws Exception {
        var r=request(PlanCode.STANDARD);
        jdbc.execute("CREATE TRIGGER dbo.TR_payment_test_audit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action LIKE 'SUBSCRIPTION_PAYMENT_%') THROW 51980,'Payment audit fixture',1; END");
        try { assertThrows(RuntimeException.class,()->service.create(owner,r,"127.0.0.1"));assertEquals(0,count("owner_user_id=?",owner)); }
        finally { jdbc.execute("DROP TRIGGER dbo.TR_payment_test_audit"); }
        var p=service.create(owner,r,"127.0.0.1");
        jdbc.execute("CREATE TRIGGER dbo.TR_payment_test_audit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='SUBSCRIPTION_PAYMENT_SUCCEEDED') THROW 51980,'Payment audit fixture',1; END");
        try {
            mvc.perform(get("/api/v1/payments/vnpay/ipn").params(callback(p,"00","00"))).andExpect(status().isOk()).andExpect(jsonPath("$.RspCode").value("99"));
            assertEquals("PENDING",service.read(owner,p.paymentId()).status());assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
        } finally { jdbc.execute("DROP TRIGGER dbo.TR_payment_test_audit"); }
        assertEquals("00",service.ipn(callback(p,"00","00")).code());assertEquals("STANDARD",quotas.current(owner).effectivePlan().code());
    }
    @Test void reusedGatewayTransactionCannotGrantToAnotherOwner() {
        var p=create(PlanCode.STANDARD);var q=callback(p,"00","00");service.ipn(q);
        long first=owner;owner();var second=create(PlanCode.STANDARD);var other=callback(second,"00","00");
        other.set("vnp_TransactionNo",q.getFirst("vnp_TransactionNo"));resign(other);
        assertThrows(RuntimeException.class,()->service.ipn(other));assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
        assertEquals("STANDARD",quotas.current(first).effectivePlan().code());
    }
    @Test void ownershipRoleAuthenticationAndPublicIpnContract() throws Exception {
        var p=create(PlanCode.STANDARD);
        mvc.perform(get("/api/v1/subscriptions/me/payments/"+p.paymentId())).andExpect(status().isUnauthorized());
        var principal=new CustomUserPrincipal(owner,userPublic,userPublic+"@example.test");
        var wrongRole=UsernamePasswordAuthenticationToken.authenticated(principal,null,List.of(new SimpleGrantedAuthority("ROLE_STAFF")));
        mvc.perform(get("/api/v1/subscriptions/me/payments/"+p.paymentId()).with(authentication(wrongRole))).andExpect(status().isForbidden());
        long first=owner;owner();var other=new CustomUserPrincipal(owner,userPublic,userPublic+"@example.test");
        var auth=UsernamePasswordAuthenticationToken.authenticated(other,null,List.of(new SimpleGrantedAuthority("ROLE_VAULT_OWNER")));
        mvc.perform(get("/api/v1/subscriptions/me/payments/"+p.paymentId()).with(authentication(auth))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/payments/vnpay/ipn")).andExpect(status().isOk()).andExpect(jsonPath("$.RspCode").value("97"));
        mvc.perform(get("/api/v1/payments/vnpay/ipn").params(callback(p,"00","00"))).andExpect(status().isOk()).andExpect(jsonPath("$.RspCode").value("00"));
        assertEquals("STANDARD",quotas.current(first).effectivePlan().code());
    }
    @Test void checkoutApiValidatesRoleBodyAndIgnoresClientPrice() throws Exception {
        var r=request(PlanCode.STANDARD);
        String body="{\"planCode\":\"STANDARD\",\"catalogVersion\":"+r.catalogVersion()+",\"idempotencyKey\":\""+r.idempotencyKey()+"\",\"amountVnd\":1}";
        String path="/api/v1/subscriptions/me/payments";
        mvc.perform(post(path).contentType("application/json").content(body)).andExpect(status().isUnauthorized());
        var user=new CustomUserPrincipal(owner,userPublic,userPublic+"@example.test");
        var staff=UsernamePasswordAuthenticationToken.authenticated(user,null,List.of(new SimpleGrantedAuthority("ROLE_STAFF")));
        var auth=UsernamePasswordAuthenticationToken.authenticated(user,null,List.of(new SimpleGrantedAuthority("ROLE_VAULT_OWNER")));
        mvc.perform(post(path).with(authentication(staff)).contentType("application/json").content(body)).andExpect(status().isForbidden());
        mvc.perform(post(path).with(authentication(auth)).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
        mvc.perform(post(path).with(authentication(auth)).contentType("application/json").content(body)).andExpect(status().isOk())
            .andExpect(jsonPath("$.amountVnd").value(499000)).andExpect(jsonPath("$.status").value("PENDING"));
        assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
    }
    @Test void differentConcurrentRequestsCannotOpenTwoActiveCheckouts() throws Exception {
        var pool=Executors.newFixedThreadPool(2);var latch=new CountDownLatch(1);
        try {
            Callable<String> task=()->{var r=request(PlanCode.STANDARD);latch.await();try {service.create(owner,r,"127.0.0.1");return "CREATED";}
                catch(BusinessException e) {return e.getErrorCode().name();}};
            var a=pool.submit(task);var b=pool.submit(task);latch.countDown();
            assertEquals(Set.of("CREATED","PAYMENT_REQUEST_CONFLICT"),Set.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS)));
            assertEquals(1,count("owner_user_id=?",owner));
        } finally {pool.shutdownNow();}
    }
    @Test void paymentPreservesVaultAndContentAndRecordsDisabledOwners() {
        long vault=jdbc.queryForObject("INSERT dbo.vaults(owner_user_id,vault_name,status) OUTPUT inserted.vault_id VALUES(?,'Preserve payment fixture','ACTIVE')",Long.class,owner);
        long asset=jdbc.queryForObject("INSERT dbo.assets(vault_id,asset_type,title) OUTPUT inserted.asset_id VALUES(?,'TEXT','Preserve payment asset')",Long.class,vault);
        var p=create(PlanCode.STANDARD);
        jdbc.update("UPDATE dbo.users SET status='INACTIVE' WHERE user_id=?",owner);
        assertEquals("00",service.ipn(callback(p,"00","00")).code());
        assertEquals("SUCCEEDED",service.read(owner,p.paymentId()).status());
        jdbc.update("UPDATE dbo.users SET status='ACTIVE' WHERE user_id=?",owner);
        assertEquals("STANDARD",quotas.current(owner).effectivePlan().code());
        assertTrue(quotas.current(owner).vaultCreated());assertEquals(1,quotas.current(owner).usage().assetCount());
        assertEquals(vault,jdbc.queryForObject("SELECT vault_id FROM dbo.assets WHERE asset_id=?",Long.class,asset));
    }

    @Test void adminLookupReadsVerifiedSnapshotsFiltersAndStablePages() {
        var admin=context.getBean(AdminSubscriptionService.class);
        var payment=create(PlanCode.STANDARD);
        assertEquals("00",service.ipn(callback(payment,"00","00")).code());
        // A later catalog edit must never rewrite the payment snapshot.
        long price=jdbc.queryForObject("SELECT purchase_price_vnd FROM dbo.subscription_plans WHERE plan_code='STANDARD'",Long.class);
        try {
            jdbc.update("UPDATE dbo.subscription_plans SET purchase_price_vnd=700000 WHERE plan_code='STANDARD'");
            var detail=admin.transactionDetail(payment.paymentId());
            assertEquals(499000,detail.amountVnd()); assertEquals("SUCCEEDED",detail.status());
            assertEquals(payment.catalogVersion(),detail.catalogVersion()); assertEquals(50,detail.limits().assetCount());
            assertEquals(userPublic,detail.accountId()); assertNotNull(detail.completedAt());
            assertEquals(1,admin.lookupTransactions(null,userPublic,"SUCCEEDED",null,null,0,1).totalElements());
            assertEquals(0,admin.lookupTransactions(null,userPublic,"FAILED",null,null,0,1).totalElements());
            assertEquals(1,admin.lookupTransactions(detail.gatewayReference()).totalElements());
            assertEquals(1,admin.lookupTransactions(detail.checkoutReference()).totalElements());
            assertEquals(1,admin.lookupTransactions(userPublic+"@example.test").totalElements());
            assertEquals(1,admin.lookupTransactions(null,userPublic,null,detail.createdAt(),detail.createdAt().plusSeconds(1),0,20).totalElements());
            assertEquals(0,admin.lookupTransactions(null,userPublic,null,null,detail.createdAt(),0,20).totalElements());
            assertTrue(admin.lookupTransactions(null,userPublic,null,null,null,1,1).content().isEmpty());
            assertEquals(0,admin.lookupTransactions("' OR 1=1 --").totalElements());
            var upgrade=create(PlanCode.EXTENDED);
            assertEquals("00",service.ipn(callback(upgrade,"24","02")).code());
            var first=admin.lookupTransactions(null,userPublic,null,null,null,0,1);
            var second=admin.lookupTransactions(null,userPublic,null,null,null,1,1);
            assertEquals(2,first.totalElements());assertNotEquals(first.content().getFirst().paymentId(),second.content().getFirst().paymentId());
            assertEquals("FAILED",admin.transactionDetail(upgrade.paymentId()).persistedStatus());
        } finally {jdbc.update("UPDATE dbo.subscription_plans SET purchase_price_vnd=? WHERE plan_code='STANDARD'",price);}
    }
    @Test void adminExpiredViewDoesNotChangePersistedStateOrConferEntitlement() {
        var admin=context.getBean(AdminSubscriptionService.class); var payment=create(PlanCode.STANDARD);
        jdbc.update("UPDATE dbo.subscription_payments SET created_at=DATEADD(minute,-30,SYSUTCDATETIME()),expires_at=DATEADD(minute,-15,SYSUTCDATETIME()) WHERE payment_id=?",payment.paymentId().toString());
        var detail=admin.transactionDetail(payment.paymentId());
        assertEquals("EXPIRED",detail.status());assertEquals("PENDING",detail.persistedStatus());assertNull(detail.completedAt());
        assertEquals(1,admin.lookupTransactions(null,userPublic,"EXPIRED",null,null,0,20).totalElements());
        assertEquals(0,admin.lookupTransactions(null,userPublic,"PENDING",null,null,0,20).totalElements());
        assertEquals("BASIC",quotas.current(owner).effectivePlan().code());
    }
    @Test void adminReadDuringVerifiedIpnIsCommittedAndConsistent() throws Exception {
        var admin=context.getBean(AdminSubscriptionService.class);var payment=create(PlanCode.STANDARD);var signed=callback(payment,"00","00");
        var barrier=new CyclicBarrier(2);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var write=pool.submit(()->{barrier.await(10,TimeUnit.SECONDS);return service.ipn(signed).code();});
            var read=pool.submit(()->{barrier.await(10,TimeUnit.SECONDS);return admin.lookupTransactions(null,userPublic,"SUCCEEDED",null,null,0,20);});
            var observed=read.get(30,TimeUnit.SECONDS); assertEquals(observed.totalElements(),observed.content().size());
            for(var row:observed.content()) {assertEquals("SUCCEEDED",row.persistedStatus());assertNotNull(row.completedAt());assertNotNull(row.gatewayReference());}
            assertEquals("00",write.get(30,TimeUnit.SECONDS));
        }
        assertEquals("SUCCEEDED",admin.transactionDetail(payment.paymentId()).status());
    }
    @Test void adminTransactionApiUsesActualJwtRoleAccountAndExpiryChecksAndRedactsSecrets() throws Exception {
        var payment=create(PlanCode.STANDARD);
        String path="/api/v1/admin/subscriptions/transactions";
        var jwt=context.getBean(com.legacyvault.auth.JwtService.class);
        String token=jwt.generateAccessToken(userPublic,userPublic+"@example.test",List.of("ADMIN"));
        // A forged role claim is insufficient: authorities come from SQL Server.
        mvc.perform(get(path).header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_ADMIN'",owner);
        mvc.perform(get(path+"/"+payment.paymentId()).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.paymentId").value(payment.paymentId().toString()))
            .andExpect(jsonPath("$.merchant").doesNotExist()).andExpect(jsonPath("$.idempotencyKey").doesNotExist())
            .andExpect(jsonPath("$.checkoutUrl").doesNotExist()).andExpect(jsonPath("$.responseCode").doesNotExist());
        jdbc.update("UPDATE dbo.users SET status='INACTIVE' WHERE user_id=?",owner);
        mvc.perform(get(path).header("Authorization","Bearer "+token)).andExpect(status().isUnauthorized());
        jdbc.update("UPDATE dbo.users SET status='ACTIVE',deleted_at=SYSUTCDATETIME() WHERE user_id=?",owner);
        mvc.perform(get(path).header("Authorization","Bearer "+token)).andExpect(status().isUnauthorized());
        jdbc.update("UPDATE dbo.users SET deleted_at=NULL WHERE user_id=?",owner);
        String expired=io.jsonwebtoken.Jwts.builder().subject(userPublic.toString()).expiration(new java.util.Date(0))
            .signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(new byte[32])).compact();
        mvc.perform(get(path).header("Authorization","Bearer "+expired)).andExpect(status().isUnauthorized());
    }
}
