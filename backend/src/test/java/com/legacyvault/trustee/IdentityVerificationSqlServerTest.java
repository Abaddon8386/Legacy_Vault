package com.legacyvault.trustee;

import com.legacyvault.beneficiary.*;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Reuses the disposable DB harness and runs PS-44 regression against the stacked PS-45 schema too. */
@EnabledIfEnvironmentVariable(named="STAFF_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class IdentityVerificationSqlServerTest extends TrusteeContactSqlServerTest {
    UUID beneficiaryPublicId;
    Long beneficiaryId;

    @BeforeEach void seedBeneficiary() {
        beneficiaryPublicId=UUID.randomUUID();
        jdbc.update("INSERT dbo.beneficiaries(public_id,vault_id,full_name) VALUES (?,?,'Beneficiary')",beneficiaryPublicId.toString(),vaultId);
        beneficiaryId=jdbc.queryForObject("SELECT beneficiary_id FROM dbo.beneficiaries WHERE public_id=?",Long.class,beneficiaryPublicId.toString());
    }
    void verify(IdentityVerificationDtos.Result result,String suffix) {
        asStaff(() -> context.getBean(IdentityVerificationService.class).verify(beneficiaryPublicId,
                new IdentityVerificationDtos.Request(IdentityVerificationDtos.DocumentType.CCCD,"private issuer",suffix,result)));
    }
    void match() { verify(IdentityVerificationDtos.Result.MATCH,"1234"); }
    int records() { return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.beneficiary_identity_verifications WHERE beneficiary_id=?",Integer.class,beneficiaryId); }
    String status() { return jdbc.queryForObject("SELECT id_verification_status FROM dbo.beneficiaries WHERE beneficiary_id=?",String.class,beneficiaryId); }

    @Test void matchMapsCanonicalStatusAndRetainsOlderNotMatchHistory() {
        jdbc.update("INSERT dbo.beneficiary_identity_verifications(beneficiary_id,actor_user_id,document_type,result) VALUES (?,?,'CCCD','NOT_MATCH')",beneficiaryId,staffId);
        match(); match();
        assertEquals(3,records()); assertEquals(Beneficiary.VERIFIED_AT_COUNTER,status());
        var history=asStaff(() -> context.getBean(IdentityVerificationService.class).history(beneficiaryPublicId));
        assertEquals(2,history.stream().filter(r -> r.result()==IdentityVerificationDtos.Result.MATCH).count());
        assertEquals(1,history.stream().filter(r -> r.result()==IdentityVerificationDtos.Result.NOT_MATCH).count());
        assertEquals(3,history.stream().map(IdentityVerificationDtos.Response::id).distinct().count());
        String details=jdbc.queryForObject("SELECT TOP 1 details FROM dbo.audit_logs WHERE vault_id=? AND action='BENEFICIARY_IDENTITY_VERIFIED'",String.class,vaultId);
        assertFalse(details.contains("private issuer")); assertFalse(details.contains("1234"));
    }

    @Test void sqlCasePredicatesRejectIdentityWritesAndHistory() {
        for (String update : List.of("assigned_staff_user_id=NULL","assigned_staff_user_id="+ownerId,"status='CANCELLED'")) {
            jdbc.update("UPDATE dbo.verification_cases SET "+update+" WHERE verification_case_id=?",caseId);
            notFound(this::match);
            notFound(() -> asStaff(() -> context.getBean(IdentityVerificationService.class).history(beneficiaryPublicId)));
            jdbc.update("UPDATE dbo.verification_cases SET status='OPEN',assigned_staff_user_id=? WHERE verification_case_id=?",staffId,caseId);
        }
        // A real OPEN case owned by this Staff for a different Vault must not authorize this target.
        Long otherOwner=user(UUID.randomUUID());
        jdbc.update("INSERT dbo.vaults(owner_user_id,vault_name) VALUES (?,'Other Vault')",otherOwner);
        Long otherVault=jdbc.queryForObject("SELECT vault_id FROM dbo.vaults WHERE owner_user_id=?",Long.class,otherOwner);
        jdbc.update("UPDATE dbo.verification_cases SET vault_id=? WHERE verification_case_id=?",otherVault,caseId);
        notFound(this::match);
        notFound(() -> asStaff(() -> context.getBean(IdentityVerificationService.class).history(beneficiaryPublicId)));
        jdbc.update("DELETE dbo.verification_cases WHERE verification_case_id=?",caseId);
        notFound(this::match);
        assertEquals(0,records()); assertEquals(0,audits("BENEFICIARY_IDENTITY_VERIFIED"));
    }

    @Test void notMatchResetsBothPriorStatesAndPreservesEveryHistoryRecord() {
        int expectedRecords = 0;
        for (String before : List.of(Beneficiary.NOT_VERIFIED,Beneficiary.VERIFIED_AT_COUNTER)) {
            jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status=? WHERE beneficiary_id=?",before,beneficiaryId);
            verify(IdentityVerificationDtos.Result.NOT_MATCH,"1234");
            assertEquals(Beneficiary.NOT_VERIFIED,status()); assertEquals(++expectedRecords,records());
        }
        assertEquals(2,audits("BENEFICIARY_IDENTITY_VERIFIED"));
        assertEquals(List.of("NOT_MATCH", "NOT_MATCH"), jdbc.queryForList(
                "SELECT result FROM dbo.beneficiary_identity_verifications WHERE beneficiary_id=? ORDER BY verification_id",
                String.class, beneficiaryId));
    }

    @Test void auditFailureReallyRollsBackIdentityHistoryAndCurrentStatus() {
        String trigger="fail_identity_"+vaultId;
        jdbc.execute("CREATE TRIGGER dbo."+trigger+" ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE vault_id="+vaultId+" AND action='BENEFICIARY_IDENTITY_VERIFIED') THROW 51000, 'injected audit failure', 1; END");
        try { assertThrows(RuntimeException.class,this::match); }
        finally { jdbc.execute("DROP TRIGGER dbo."+trigger); }
        assertEquals(0,records()); assertEquals(Beneficiary.NOT_VERIFIED,status());
        assertEquals(0,audits("BENEFICIARY_IDENTITY_VERIFIED"));
    }

    @Test void auditFailureOnNotMatchRetainsPreviousVerifiedStatus() {
        match();
        String trigger="fail_not_match_"+vaultId;
        jdbc.execute("CREATE TRIGGER dbo."+trigger+" ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE vault_id="+vaultId+" AND action='BENEFICIARY_IDENTITY_VERIFIED') THROW 51000, 'injected audit failure', 1; END");
        try { assertThrows(RuntimeException.class, () -> verify(IdentityVerificationDtos.Result.NOT_MATCH,"4321")); }
        finally { jdbc.execute("DROP TRIGGER dbo."+trigger); }
        assertEquals(1,records()); assertEquals(Beneficiary.VERIFIED_AT_COUNTER,status());
        assertEquals(1,audits("BENEFICIARY_IDENTITY_VERIFIED"));
    }

    @Test void concurrentMatchesSerializeWithoutLosingHistory() throws Exception {
        CountDownLatch locked=new CountDownLatch(1),release=new CountDownLatch(1);
        Future<?> first=workers.submit(() -> tx.execute(s -> { verify(IdentityVerificationDtos.Result.MATCH,"1111");locked.countDown();await(release);return null; }));
        try {
            assertTrue(locked.await(10,TimeUnit.SECONDS));
            Future<?> second=workers.submit(() -> verify(IdentityVerificationDtos.Result.MATCH,"2222"));
            assertThrows(TimeoutException.class,() -> second.get(300,TimeUnit.MILLISECONDS));
            release.countDown();first.get(20,TimeUnit.SECONDS);second.get(20,TimeUnit.SECONDS);
            assertEquals(2,records());assertEquals(Beneficiary.VERIFIED_AT_COUNTER,status());
            assertEquals(List.of("1111","2222"),jdbc.queryForList("SELECT document_suffix FROM dbo.beneficiary_identity_verifications WHERE beneficiary_id=? ORDER BY verification_id",String.class,beneficiaryId));
            assertEquals(2,audits("BENEFICIARY_IDENTITY_VERIFIED"));
        } finally { release.countDown(); }
    }

    @ParameterizedTest
    @EnumSource(IdentityVerificationDtos.Result.class)
    void concurrentMixedResultsFollowSerializedOrder(IdentityVerificationDtos.Result firstResult) throws Exception {
        var secondResult = firstResult == IdentityVerificationDtos.Result.MATCH
                ? IdentityVerificationDtos.Result.NOT_MATCH : IdentityVerificationDtos.Result.MATCH;
        CountDownLatch locked=new CountDownLatch(1),release=new CountDownLatch(1);
        Future<?> first=workers.submit(() -> tx.execute(s -> {
            verify(firstResult,"1111"); locked.countDown(); await(release); return null;
        }));
        try {
            assertTrue(locked.await(10,TimeUnit.SECONDS));
            Future<?> second=workers.submit(() -> verify(secondResult,"2222"));
            assertThrows(TimeoutException.class,() -> second.get(300,TimeUnit.MILLISECONDS));
            release.countDown(); first.get(20,TimeUnit.SECONDS); second.get(20,TimeUnit.SECONDS);
            assertEquals(2,records());
            assertEquals(secondResult == IdentityVerificationDtos.Result.MATCH
                    ? Beneficiary.VERIFIED_AT_COUNTER : Beneficiary.NOT_VERIFIED,status());
            assertEquals(List.of(firstResult.name(),secondResult.name()),jdbc.queryForList(
                    "SELECT result FROM dbo.beneficiary_identity_verifications WHERE beneficiary_id=? ORDER BY verification_id",
                    String.class,beneficiaryId));
            assertEquals(2,audits("BENEFICIARY_IDENTITY_VERIFIED"));
        } finally { release.countDown(); }
    }

    @Test void cancelBeforeIdentityRejectsWaitingWrite() throws Exception {
        CountDownLatch locked=new CountDownLatch(1),release=new CountDownLatch(1);
        Future<?> cancellation=workers.submit(() -> tx.execute(s -> {cancel();locked.countDown();await(release);return null;}));
        try {
            assertTrue(locked.await(10,TimeUnit.SECONDS));
            Future<?> write=workers.submit(() -> notFound(this::match));
            assertThrows(TimeoutException.class,() -> write.get(300,TimeUnit.MILLISECONDS));
            release.countDown();cancellation.get(20,TimeUnit.SECONDS);write.get(20,TimeUnit.SECONDS);
            assertEquals(0,records());assertEquals(0,audits("BENEFICIARY_IDENTITY_VERIFIED"));
        } finally {release.countDown();}
    }

    @Test void identityCommitBeforeCancelRetainsCompletedHistory() throws Exception {
        CountDownLatch locked=new CountDownLatch(1),release=new CountDownLatch(1);
        Future<?> write=workers.submit(() -> tx.execute(s -> {match();locked.countDown();await(release);return null;}));
        try {
            assertTrue(locked.await(10,TimeUnit.SECONDS));
            Future<?> cancellation=workers.submit(this::cancel);
            assertThrows(TimeoutException.class,() -> cancellation.get(300,TimeUnit.MILLISECONDS));
            release.countDown();write.get(20,TimeUnit.SECONDS);cancellation.get(20,TimeUnit.SECONDS);
            assertEquals(1,records());assertEquals(Beneficiary.VERIFIED_AT_COUNTER,status());
            notFound(this::match);assertEquals(1,audits("BENEFICIARY_IDENTITY_VERIFIED"));
        } finally {release.countDown();}
    }
}
