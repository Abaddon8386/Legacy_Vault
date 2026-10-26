package com.legacyvault.verification;

import com.legacyvault.dms.*;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.service.VaultService;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DmsMinuteSqlServerTest extends LegalBasisSqlServerSupport {
    long owner,vault;
    UUID publicOwner;
    DmsService dms;
    MockMvc mvc;
    @BeforeEach void prepare() {
        publicOwner=UUID.randomUUID();
        owner=jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES(?,'Minute fixture',?,'unused','ACTIVE')",Long.class,publicOwner.toString(),publicOwner+"@example.test");
        vault=jdbc.queryForObject("INSERT dbo.vaults(owner_user_id,vault_name,status) OUTPUT inserted.vault_id VALUES(?,'Minute fixture','ACTIVE')",Long.class,owner);
        jdbc.update("INSERT dbo.beneficiaries(vault_id,full_name) VALUES(?,'Minute beneficiary')",vault);
        dms=context.getBean(DmsService.class);login("VAULT_OWNER");
        mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).build();
    }
    void login(String role) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
            new CustomUserPrincipal(owner,publicOwner,publicOwner+"@example.test"),null,List.of(new SimpleGrantedAuthority("ROLE_"+role))));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    DmsDtos.Response configure(int minutes) { return dms.configure(new DmsDtos.ConfigureRequest(null,minutes)); }
    @Test void persistsMinuteDurationLegacyDaysAndExactServerDeadlines() {
        Instant before=Instant.now();var r=configure(1501);Instant after=Instant.now();
        assertNull(r.checkIntervalDays());assertEquals(1501,r.checkIntervalMinutes());
        Instant anchor=Instant.parse(r.nextCheckAt()).minusSeconds(1501*60);
        assertFalse(anchor.isBefore(before.minusSeconds(1)));assertFalse(anchor.isAfter(after.plusSeconds(1)));
        assertEquals(1501,dms.get().checkIntervalMinutes());
        var check=dms.checkIn();assertEquals(Duration.ofMinutes(1501),Duration.between(Instant.parse(check.lastCheckInAt()),Instant.parse(check.nextCheckAt())));
        var old=dms.configure(new DmsDtos.ConfigureRequest(30));assertEquals(30,old.checkIntervalDays());assertEquals(43200,old.checkIntervalMinutes());
    }
    @Test void legacyRawRowsAboveNewMaximumStillReadAndCheckInWithoutTruncation() {
        jdbc.update("INSERT dbo.dms_configs(owner_user_id,check_interval_days,grace_period_days,next_check_at) VALUES(?,32767,1,DATEADD(DAY,32767,SYSUTCDATETIME()))",owner);
        assertEquals(47184480,dms.get().checkIntervalMinutes());
        var r=dms.checkIn();assertEquals(Duration.ofDays(32767),Duration.between(Instant.parse(r.lastCheckInAt()),Instant.parse(r.nextCheckAt())));
        assertThrows(BusinessException.class,()->dms.configure(new DmsDtos.ConfigureRequest(32767)));
    }
    @Test void schedulerHonorsMinuteBoundaryGraceAndCancelRestoresExactDuration() {
        var r=configure(1);long id=jdbc.queryForObject("SELECT dms_id FROM dbo.dms_configs WHERE owner_user_id=?",Long.class,owner);
        var due=LocalDateTime.ofInstant(Instant.parse(r.nextCheckAt()),ZoneOffset.UTC);
        var scheduler=context.getBean(DmsTriggerProcessor.class);
        scheduler.triggerIfExpired(id,due.minusNanos(1));assertEquals("MONITORING",dms.get().status());
        scheduler.triggerIfExpired(id,due);assertEquals("TRIGGERED",dms.get().status());
        assertEquals(due.plusDays(1).toInstant(ZoneOffset.UTC),Instant.parse(dms.get().graceDeadline()));
        assertEquals("ACTIVE",jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?",String.class,vault));
        assertEquals(0,count("verification_cases","vault_id=?",vault));
        scheduler.processGracePeriodExpired(id,due.plusDays(1));
        assertEquals("AWAITING_VERIFICATION",jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?",String.class,vault));
        var publicVault=UUID.fromString(jdbc.queryForObject("SELECT public_id FROM dbo.vaults WHERE vault_id=?",String.class,vault));
        context.getBean(VaultService.class).cancelAlert(publicVault,new CustomUserPrincipal(owner,publicOwner,publicOwner+"@example.test"));
        var restored=dms.get();assertEquals("MONITORING",restored.status());
        assertEquals(Duration.ofMinutes(1),Duration.between(Instant.parse(restored.lastCheckInAt()),Instant.parse(restored.nextCheckAt())));
        assertEquals(1,count("verification_cases","vault_id=? AND status='CANCELLED'",vault));
    }
    @Test void malformedConflictingOrOutOfRangeApiRequestsAreRejectedAndRolesEnforced() throws Exception {
        var auth=SecurityContextHolder.getContext().getAuthentication();SecurityContextHolder.clearContext();
        mvc.perform(put("/api/v1/dms").contentType("application/json").content("{\"checkIntervalMinutes\":1}")).andExpect(status().isUnauthorized());
        login("STAFF_EXECUTOR");var staff=SecurityContextHolder.getContext().getAuthentication();SecurityContextHolder.clearContext();
        mvc.perform(get("/api/v1/dms").with(authentication(staff))).andExpect(status().isForbidden());
        for(String body:List.of("{}","{\"checkIntervalDays\":1,\"checkIntervalMinutes\":1440}","{\"checkIntervalMinutes\":0}","{\"checkIntervalMinutes\":259201}",
            "{\"checkIntervalMinutes\":1.5}","{\"checkIntervalMinutes\":\"1\"}","{\"checkIntervalMinutes\":2147483648}","{\"checkIntervalMinutes\":1,\"unit\":\"seconds\"}","{\"checkIntervalMinutes\":1,\"checkIntervalMinutes\":2}"))
            mvc.perform(put("/api/v1/dms").with(authentication(auth)).contentType("application/json").content(body))
                .andExpect(result -> assertEquals(400,result.getResponse().getStatus(),body));
        mvc.perform(put("/api/v1/dms").with(authentication(auth)).contentType("application/json").content("{\"checkIntervalMinutes\":90}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.checkIntervalMinutes").value(90)).andExpect(jsonPath("$.checkIntervalDays").isEmpty());
    }
    @Test void auditFailureRollsBackMinuteChangeAndTime() {
        var old=configure(90);
        jdbc.execute("CREATE TRIGGER dbo.TR_minute_audit_fixture ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='DMS_CONFIGURED') THROW 51991,'Minute audit fixture',1; END");
        try { assertThrows(RuntimeException.class,()->configure(1501));assertEquals(old,dms.get()); }
        finally {jdbc.execute("DROP TRIGGER dbo.TR_minute_audit_fixture");}
    }
    @Test void simultaneousCheckInAndSchedulerAreSerialized() throws Exception {
        var r=configure(1);long id=jdbc.queryForObject("SELECT dms_id FROM dbo.dms_configs WHERE owner_user_id=?",Long.class,owner);
        jdbc.update("UPDATE dbo.dms_configs SET next_check_at=DATEADD(MINUTE,-1,SYSUTCDATETIME()) WHERE dms_id=?",id);
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try {
            var a=pool.submit(()->{login("VAULT_OWNER");start.await();try {dms.checkIn();return "CHECKED_IN";}catch(BusinessException e) {assertEquals(ErrorCode.DMS_NOT_MONITORING,e.getErrorCode());return "TRIGGERED";}finally {clear();}});
            var b=pool.submit(()->{start.await();context.getBean(DmsTriggerProcessor.class).triggerIfExpired(id,LocalDateTime.now(ZoneOffset.UTC));return true;});start.countDown();
            var outcome=a.get(20,TimeUnit.SECONDS);assertTrue(b.get(20,TimeUnit.SECONDS));
            var current=dms.get();assertEquals(outcome.equals("CHECKED_IN")?"MONITORING":"TRIGGERED",current.status());assertEquals(1,current.checkIntervalMinutes());
        } finally {pool.shutdownNow();assertTrue(pool.awaitTermination(20,TimeUnit.SECONDS));}
    }
    @Test void ownerCannotReadOrOverwriteAnotherOwnersMinuteConfiguration() throws Exception {
        configure(90);long firstOwner=owner;
        prepare();
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND,assertThrows(BusinessException.class,()->dms.get()).getErrorCode());
        configure(1);assertEquals(1,dms.get().checkIntervalMinutes());
        assertEquals(90,jdbc.queryForObject("SELECT check_interval_minutes FROM dbo.dms_configs WHERE owner_user_id=?",Integer.class,firstOwner));
        var auth=SecurityContextHolder.getContext().getAuthentication();SecurityContextHolder.clearContext();
        mvc.perform(put("/api/v1/dms").with(authentication(auth)).contentType("application/json")
            .content("{\"checkIntervalMinutes\":2,\"ownerId\":\""+firstOwner+"\"}"))
            .andExpect(status().isBadRequest());
        assertEquals(90,jdbc.queryForObject("SELECT check_interval_minutes FROM dbo.dms_configs WHERE owner_user_id=?",Integer.class,firstOwner));
    }
}
