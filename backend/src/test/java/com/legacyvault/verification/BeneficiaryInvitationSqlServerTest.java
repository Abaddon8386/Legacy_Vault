package com.legacyvault.verification;

import com.legacyvault.beneficiary.*;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real Spring/Flyway/JPA/API SQL tests, fresh randomized disposable DB via inherited fixture. */
@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class BeneficiaryInvitationSqlServerTest extends LegalBasisSqlServerSupport {
    record F(long owner, UUID ownerPublic, long vault, UUID vaultPublic, long beneficiary, UUID beneficiaryPublic) { }
    private F ready() {
        User owner = account("ROLE_VAULT_OWNER");
        UUID vaultPublic = UUID.randomUUID(), beneficiaryPublic = UUID.randomUUID();
        long vault = jdbc.queryForObject("INSERT dbo.vaults(public_id,owner_user_id,vault_name,status) OUTPUT inserted.vault_id VALUES (?,?,'Invitation fixture','ACTIVE')",
                Long.class, vaultPublic.toString(), owner.getUserId());
        long beneficiary = jdbc.queryForObject("INSERT dbo.beneficiaries(public_id,vault_id,full_name) OUTPUT inserted.beneficiary_id VALUES (?,?,'Recipient without email')",
                Long.class, beneficiaryPublic.toString(), vault);
        return new F(owner.getUserId(), owner.getPublicId(), vault, vaultPublic, beneficiary, beneficiaryPublic);
    }
    private User account(String... roles) {
        UUID uuid = UUID.randomUUID();
        long id = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES (?,'Invite account',?,'unused','ACTIVE')",
                Long.class, uuid.toString(), uuid + "@example.test");
        for (String role : roles) jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code=?", id, role);
        return tx.execute(s -> context.getBean(UserRepository.class).findById(id).orElseThrow());
    }
    private UsernamePasswordAuthenticationToken auth(F f) {
        return new UsernamePasswordAuthenticationToken(new CustomUserPrincipal(f.owner(), f.ownerPublic(), f.ownerPublic()+"@example.test"),
                null, List.of(new SimpleGrantedAuthority("ROLE_VAULT_OWNER")));
    }
    private <T> T owner(F f, Supplier<T> action) {
        var previous = SecurityContextHolder.getContext();
        var security = SecurityContextHolder.createEmptyContext(); security.setAuthentication(auth(f));
        SecurityContextHolder.setContext(security);
        try { return action.get(); } finally { SecurityContextHolder.setContext(previous); }
    }
    private BeneficiaryInvitationService service() { return context.getBean(BeneficiaryInvitationService.class); }
    private InvitationDtos.Issued issue(F f) { return owner(f, () -> service().issue(f.vaultPublic(), f.beneficiaryPublic())); }
    private InvitationDtos.Metadata metadata(F f) { return owner(f, () -> service().get(f.vaultPublic(), f.beneficiaryPublic())); }
    private InvitationDtos.Issued reissue(F f, int generation) {
        return owner(f, () -> service().reissue(f.vaultPublic(), f.beneficiaryPublic(), generation));
    }
    private void revoke(F f) { owner(f, () -> { service().revoke(f.vaultPublic(), f.beneficiaryPublic(), 1); return null; }); }
    private InvitationDtos.Linked link(String code, User account) {
        return tx.execute(s -> service().linkAccount(code, account.getUserId()));
    }
    private void assertCode(ErrorCode code, org.junit.jupiter.api.function.Executable work) {
        assertEquals(code, assertThrows(BusinessException.class, work).getErrorCode());
    }
    private int audits(F f, String action) { return count("audit_logs", "vault_id=? AND action=?", f.vault(), action); }
    private <T> List<T> concurrent(Callable<T> first, Callable<T> second) throws Exception {
        var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> { barrier.await(5, TimeUnit.SECONDS); return first.call(); });
            var b = pool.submit(() -> { barrier.await(5, TimeUnit.SECONDS); return second.call(); });
            return Arrays.asList(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
        }
    }
    private String outcome(Supplier<?> call) {
        try { call.get(); return "OK"; } catch (BusinessException ex) { return ex.getErrorCode().name(); }
    }
    private <T> T staff(User actor, Supplier<T> call) {
        var previous = SecurityContextHolder.getContext();
        var security = SecurityContextHolder.createEmptyContext();
        security.setAuthentication(new UsernamePasswordAuthenticationToken(new CustomUserPrincipal(actor.getUserId(), actor.getPublicId(), actor.getEmail()),
                null, List.of(new SimpleGrantedAuthority("ROLE_STAFF_EXECUTOR"))));
        SecurityContextHolder.setContext(security);
        try { return call.get(); } finally { SecurityContextHolder.setContext(previous); }
    }
    private BeneficiaryAccountService counterWithUsers(UserRepository users) {
        return new BeneficiaryAccountService(context.getBean(BeneficiaryRepository.class),
                context.getBean(com.legacyvault.common.security.StaffContextService.class),
                context.getBean(com.legacyvault.verification.service.StaffVaultCaseGuard.class), entities,
                users, context.getBean(com.legacyvault.user.repository.RoleRepository.class),
                context.getBean(com.legacyvault.user.repository.UserRoleRepository.class),
                context.getBean(org.springframework.security.crypto.password.PasswordEncoder.class),
                context.getBean(com.legacyvault.common.audit.AuditService.class),
                context.getBean(com.legacyvault.beneficiary.BeneficiaryInvitationService.class));
    }
    private void prepareCounter(F f, User staff) {
        jdbc.update("INSERT dbo.verification_cases(vault_id,triggered_at,assigned_staff_user_id) VALUES (?,SYSUTCDATETIME(),?)", f.vault(), staff.getUserId());
        jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status='VERIFIED_AT_COUNTER' WHERE beneficiary_id=?", f.beneficiary());
    }

    @Test void freshMigrationHashOnlyAndSevenDayLifetimeWithoutEmail() {
        var f = ready(); assertEquals("NOT_ISSUED", metadata(f).state());
        var issued = issue(f);
        assertTrue(context.getBean(InvitationTokens.class).validFormat(issued.code()));
        assertEquals(7 * 86400, issued.invitation().expiresAt().getEpochSecond() - issued.invitation().issuedAt().getEpochSecond());
        assertEquals("PENDING", metadata(f).state());
        assertEquals(issued.invitation(), metadata(f));
        assertEquals(context.getBean(InvitationTokens.class).hash(issued.code()), jdbc.queryForObject(
                "SELECT code_hash FROM dbo.beneficiary_invitations WHERE beneficiary_id=?", String.class, f.beneficiary()));
        assertEquals(1, audits(f, "BENEFICIARY_INVITATION_ISSUED"));
        String details = jdbc.queryForObject("SELECT details FROM dbo.audit_logs WHERE vault_id=? AND action='BENEFICIARY_INVITATION_ISSUED'", String.class, f.vault());
        assertFalse(details.contains(issued.code()));
        assertFalse(details.contains(context.getBean(InvitationTokens.class).hash(issued.code())));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.beneficiary_invitations') AND name IN ('code','raw_code','secret')", Integer.class));
        assertEquals(1, count("beneficiaries", "vault_id=? AND linked_user_id IS NULL AND id_verification_status='NOT_VERIFIED'", f.vault()));
    }
    @Test void ownerCannotManageAnotherVaultOrUnknownBeneficiary() {
        var mine = ready(); var other = ready();
        for (Supplier<?> call : List.<Supplier<?>>of(
                () -> service().get(other.vaultPublic(), other.beneficiaryPublic()),
                () -> service().issue(other.vaultPublic(), other.beneficiaryPublic()),
                () -> service().reissue(other.vaultPublic(), other.beneficiaryPublic(), 1),
                () -> { service().revoke(other.vaultPublic(), other.beneficiaryPublic(), 1); return null; },
                () -> service().issue(mine.vaultPublic(), other.beneficiaryPublic()),
                () -> service().issue(mine.vaultPublic(), UUID.randomUUID()))) {
            assertCode(ErrorCode.RESOURCE_NOT_FOUND, () -> owner(mine, call));
        }
        assertEquals(0, count("beneficiary_invitations", "beneficiary_id=?", other.beneficiary()));
    }
    @Test void duplicateIssueDoesNotRotateOrCreateDuplicateBeneficiary() {
        var f = ready(); var original = issue(f);
        assertCode(ErrorCode.BENEFICIARY_INVITATION_ALREADY_EXISTS, () -> issue(f));
        assertEquals(original.invitation(), metadata(f));
        assertEquals(1, count("beneficiaries", "vault_id=?", f.vault()));
        assertEquals(1, count("beneficiary_invitations", "beneficiary_id=?", f.beneficiary()));
    }
    @Test void reissueRetainsHistoryInvalidatesOldCodeAndRejectsStaleGeneration() {
        var f = ready(); var old = issue(f); var next = reissue(f, 1); var account = account();
        assertNotEquals(old.code(), next.code()); assertEquals(2, next.invitation().generation());
        assertCode(ErrorCode.BENEFICIARY_INVITATION_STALE, () -> reissue(f, 1));
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(old.code(), account));
        assertEquals(1, count("beneficiary_invitations", "beneficiary_id=? AND is_current=0 AND revoked_at IS NOT NULL", f.beneficiary()));
        assertEquals(1, count("beneficiary_invitations", "beneficiary_id=? AND is_current=1", f.beneficiary()));
        assertEquals("ACCOUNT_CREATED", link(next.code(), account).accountStatus());
    }
    @Test void revokeIsIdempotentAndCanBeFollowedByExplicitReissue() {
        var f = ready(); var code = issue(f).code(); revoke(f); var first = metadata(f); revoke(f);
        assertEquals(first, metadata(f)); assertEquals("REVOKED", first.state());
        assertEquals(1, audits(f, "BENEFICIARY_INVITATION_REVOKED"));
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, account()));
        assertEquals("PENDING", reissue(f, 1).invitation().state());
    }
    @Test void missingInvitationCannotBeRevokedOrReissued() {
        var f = ready(); assertCode(ErrorCode.RESOURCE_NOT_FOUND, () -> revoke(f));
        assertCode(ErrorCode.RESOURCE_NOT_FOUND, () -> reissue(f, 1));
    }
    @Test void expiredCodeIsRejectedAndCanBeReissued() {
        var f = ready(); var code = issue(f).code();
        jdbc.update("UPDATE dbo.beneficiary_invitations SET issued_at=DATEADD(day,-8,SYSUTCDATETIME()),expires_at=DATEADD(day,-1,SYSUTCDATETIME()) WHERE beneficiary_id=?", f.beneficiary());
        assertEquals("EXPIRED", metadata(f).state());
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, account()));
        assertEquals("PENDING", reissue(f, 1).invitation().state());
    }
    @Test void possessionLinksWithoutEmailAndPreservesOwnerRoleWithoutEarlyAccess() {
        var f = ready(); var code = issue(f).code(); var account = account("ROLE_VAULT_OWNER");
        assertNull(account.getEmailVerifiedAt());
        var linked = link(code, account);
        assertEquals(f.beneficiaryPublic(), linked.beneficiaryId());
        assertEquals(account.getPublicId(), linked.accountId());
        assertEquals("CONSUMED", metadata(f).state());
        assertEquals(2, count("user_roles", "user_id=?", account.getUserId()));
        assertEquals(1, count("beneficiaries", "beneficiary_id=? AND id_verification_status='NOT_VERIFIED' AND designation_status='DESIGNATED'", f.beneficiary()));
        assertEquals(1, count("vaults", "vault_id=? AND status='ACTIVE'", f.vault()));
        assertEquals(0, count("legal_basis_version_allocations", "beneficiary_id=?", f.beneficiary()));
        assertEquals(0, count("vaults", "owner_user_id=?", account.getUserId()));
        var response = owner(f, () -> context.getBean(BeneficiaryService.class).list(f.vaultPublic(), 0, 20));
        assertTrue(response.content().getFirst().hasAccount());
    }
    @Test void retryOfSameConsumedCodePreservesEvidenceAndDoesNotAuditOrGrantTwice() {
        var f = ready(); var code = issue(f).code(); var account = account();
        var first = link(code, account); var evidence = metadata(f);
        assertEquals(first, link(code, account)); assertEquals(evidence, metadata(f));
        assertEquals(1, audits(f, "BENEFICIARY_INVITATION_CONSUMED"));
        assertEquals(1, count("user_roles", "user_id=?", account.getUserId()));
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, account()));
        assertCode(ErrorCode.BENEFICIARY_INVITATION_ALREADY_USED, () -> revoke(f));
        assertCode(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED, () -> issue(f));
        assertCode(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED, () -> reissue(f, 1));
    }
    @Test void ineligibleAndInternalAccountsCannotConsumeOrChangeRoles() {
        var f = ready(); var code = issue(f).code();
        for (String role : List.of("ROLE_ADMIN", "ROLE_STAFF_EXECUTOR", "ROLE_LEGAL_VERIFIER")) {
            var internal = account(role);
            assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, internal));
            assertEquals(1, count("user_roles", "user_id=?", internal.getUserId()));
        }
        var ownerAccount = tx.execute(s -> context.getBean(UserRepository.class).findById(f.owner()).orElseThrow());
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, ownerAccount));
        var inactive = account(); jdbc.update("UPDATE dbo.users SET status='PENDING' WHERE user_id=?", inactive.getUserId());
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, inactive));
        var deleted = account(); jdbc.update("UPDATE dbo.users SET deleted_at=SYSUTCDATETIME() WHERE user_id=?", deleted.getUserId());
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, deleted));
        assertEquals("PENDING", metadata(f).state());
    }
    @Test void accountAlreadyLinkedInSameVaultAndStaffLinkedRecordAreRejected() {
        var f = ready(); var code = issue(f).code(); var account = account();
        jdbc.update("INSERT dbo.beneficiaries(vault_id,full_name,linked_user_id,account_status) VALUES (?,'Already linked',?,'ACCOUNT_CREATED')", f.vault(), account.getUserId());
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, account));
        var other = account(); jdbc.update("UPDATE dbo.beneficiaries SET linked_user_id=?,account_status='ACCOUNT_CREATED' WHERE beneficiary_id=?", other.getUserId(), f.beneficiary());
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, account()));
        assertCode(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED, () -> reissue(f, 1));
    }
    @Test void invalidCodeFormatsAndUnknownSecretsAllUseSameError() {
        var account = account();
        for (String code : Arrays.asList(null, "", "x", "a".repeat(22), context.getBean(InvitationTokens.class).generate())) {
            assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, account));
        }
        assertEquals(0, count("user_roles", "user_id=?", account.getUserId()));
    }
    @Test void frozenAndArchivedVaultsBlockEveryMutationButAllowOwnerMetadataRead() {
        for (String state : List.of("AWAITING_VERIFICATION", "ARCHIVED")) {
            var f = ready(); var code = issue(f).code(); var account = account();
            jdbc.update("UPDATE dbo.vaults SET status=? WHERE vault_id=?", state, f.vault());
            assertCode(ErrorCode.VAULT_NOT_EDITABLE, () -> issue(f));
            assertCode(ErrorCode.VAULT_NOT_EDITABLE, () -> reissue(f, 1));
            assertCode(ErrorCode.VAULT_NOT_EDITABLE, () -> revoke(f));
            assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, account));
            assertEquals("PENDING", metadata(f).state());
            assertEquals(0, count("user_roles", "user_id=?", account.getUserId()));
        }
    }
    @Test void cachedActiveVaultCannotBypassCommittedFreeze() {
        var f = ready();
        owner(f, () -> tx.execute(status -> {
            var repo = context.getBean(com.legacyvault.vault.repository.VaultRepository.class);
            assertEquals("ACTIVE", repo.findById(f.vault()).orElseThrow().getStatus());
            jdbc.update("UPDATE dbo.vaults SET status='AWAITING_VERIFICATION' WHERE vault_id=?", f.vault());
            assertCode(ErrorCode.VAULT_NOT_EDITABLE, () -> service().issue(f.vaultPublic(), f.beneficiaryPublic()));
            status.setRollbackOnly(); return null;
        }));
    }
    @Test void auditFailureRollsBackIssueAndReissueWithoutLosingOldCode() {
        var f = ready();
        jdbc.execute("CREATE TRIGGER dbo.TR_TestInvitationIssueAudit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action IN ('BENEFICIARY_INVITATION_ISSUED','BENEFICIARY_INVITATION_REISSUED')) THROW 51995,'fixture failure',1; END");
        try { assertThrows(RuntimeException.class, () -> issue(f)); }
        finally { jdbc.execute("DROP TRIGGER dbo.TR_TestInvitationIssueAudit"); }
        assertEquals("NOT_ISSUED", metadata(f).state());
        var old = issue(f);
        jdbc.execute("CREATE TRIGGER dbo.TR_TestInvitationIssueAudit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='BENEFICIARY_INVITATION_REISSUED') THROW 51995,'fixture failure',1; END");
        try { assertThrows(RuntimeException.class, () -> reissue(f, 1)); }
        finally { jdbc.execute("DROP TRIGGER dbo.TR_TestInvitationIssueAudit"); }
        assertEquals(old.invitation(), metadata(f));
        assertEquals("ACCOUNT_CREATED", link(old.code(), account()).accountStatus());
    }
    @Test void auditFailureRollsBackConsumptionRoleAndLinkTogether() {
        var f = ready(); var code = issue(f).code(); var account = account();
        jdbc.execute("CREATE TRIGGER dbo.TR_TestInvitationConsumeAudit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='BENEFICIARY_INVITATION_CONSUMED') THROW 51996,'fixture failure',1; END");
        try { assertThrows(RuntimeException.class, () -> link(code, account)); }
        finally { jdbc.execute("DROP TRIGGER dbo.TR_TestInvitationConsumeAudit"); }
        assertEquals("PENDING", metadata(f).state());
        assertEquals(0, count("user_roles", "user_id=?", account.getUserId()));
        assertEquals(1, count("beneficiaries", "beneficiary_id=? AND linked_user_id IS NULL", f.beneficiary()));
    }
    @Test void callerRollbackIncludesNewAccountAndConsumptionAndMandatoryTransactionIsEnforced() {
        var f = ready(); var code = issue(f).code(); UUID id = UUID.randomUUID();
        assertThrows(IllegalStateException.class, () -> tx.execute(status -> {
            var repo = context.getBean(UserRepository.class); var user = new User();
            user.setPublicId(id); user.setEmail(id+"@example.test"); user.setFullName("Signup fixture");
            user.setPasswordHash("unused"); user.setStatus("ACTIVE"); user = repo.saveAndFlush(user);
            service().linkAccount(code, user.getUserId());
            throw new IllegalStateException("rollback whole signup");
        }));
        assertEquals(0, count("users", "public_id=?", id.toString())); assertEquals("PENDING", metadata(f).state());
        assertThrows(org.springframework.transaction.IllegalTransactionStateException.class,
                () -> service().linkAccount(code, account().getUserId()));
    }
    @Test void concurrentInitialIssueHasOneWinner() throws Exception {
        var f = ready(); var results = concurrent(() -> outcome(() -> issue(f)), () -> outcome(() -> issue(f)));
        assertEquals(Set.of("OK", "BENEFICIARY_INVITATION_ALREADY_EXISTS"), new HashSet<>(results));
        assertEquals(1, count("beneficiary_invitations", "beneficiary_id=?", f.beneficiary()));
        assertEquals(1, audits(f, "BENEFICIARY_INVITATION_ISSUED"));
    }
    @Test void concurrentReissueRejectsStaleRetryInsteadOfRotatingTwice() throws Exception {
        var f = ready(); issue(f);
        var results = concurrent(() -> outcome(() -> reissue(f, 1)), () -> outcome(() -> reissue(f, 1)));
        assertEquals(Set.of("OK", "BENEFICIARY_INVITATION_STALE"), new HashSet<>(results));
        assertEquals(2, metadata(f).generation()); assertEquals(1, audits(f, "BENEFICIARY_INVITATION_REISSUED"));
    }
    @Test void concurrentConsumptionHasOneWinnerAndSameAccountRetryIsIdempotent() throws Exception {
        var f = ready(); var code = issue(f).code(); var first = account(); var second = account();
        var results = concurrent(() -> outcome(() -> link(code, first)), () -> outcome(() -> link(code, second)));
        assertEquals(Set.of("OK", "BENEFICIARY_INVITATION_INVALID"), new HashSet<>(results));
        var winning = results.getFirst().equals("OK") ? first : second;
        var retries = concurrent(() -> link(code, winning), () -> link(code, winning));
        assertEquals(retries.getFirst(), retries.getLast());
        assertEquals(1, audits(f, "BENEFICIARY_INVITATION_CONSUMED"));
    }
    @Test void sameAccountCanReceiveDifferentVaultInvitationsConcurrentlyWithoutDuplicateRole() throws Exception {
        var a = ready(); var b = ready(); var ac = issue(a).code(); var bc = issue(b).code(); var account = account();
        concurrent(() -> link(ac, account), () -> link(bc, account));
        assertEquals(1, count("user_roles", "user_id=?", account.getUserId()));
        assertEquals(2, count("beneficiaries", "linked_user_id=?", account.getUserId()));
    }
    @Test void actualHttpApiUsesSqlPersistenceAndDoesNotExposeSecretsInGet() throws Exception {
        var f = ready(); var other = ready();
        var mvc = MockMvcBuilders.webAppContextSetup((WebApplicationContext) context).apply(springSecurity()).build();
        var jwt = context.getBean(com.legacyvault.auth.JwtService.class);
        String bearer = "Bearer " + jwt.generateAccessToken(f.ownerPublic(), f.ownerPublic()+"@example.test", List.of("ROLE_VAULT_OWNER"));
        String otherBearer = "Bearer " + jwt.generateAccessToken(other.ownerPublic(), other.ownerPublic()+"@example.test", List.of("ROLE_VAULT_OWNER"));
        String path = "/api/v1/vaults/"+f.vaultPublic()+"/beneficiaries/"+f.beneficiaryPublic()+"/invitation";
        mvc.perform(post(path).header("Authorization", bearer)).andExpect(status().isCreated())
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.code").isString());
        mvc.perform(get(path).header("Authorization", bearer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("PENDING")).andExpect(jsonPath("$.code").doesNotExist());
        mvc.perform(get(path).header("Authorization", otherBearer)).andExpect(status().isNotFound());
        mvc.perform(get(path).header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
        var nonOwner = account();
        String injectedRole = "Bearer " + jwt.generateAccessToken(nonOwner.getPublicId(), nonOwner.getEmail(), List.of("ROLE_VAULT_OWNER"));
        mvc.perform(get(path).header("Authorization", injectedRole)).andExpect(status().isForbidden());
        mvc.perform(post(path+"/reissue").header("Authorization", bearer)
                .contentType("application/json").content("{\"generation\":1}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.invitation.generation").value(2));
        mvc.perform(delete(path).param("generation", "2").header("Authorization", bearer)).andExpect(status().isNoContent());
        assertEquals("REVOKED", metadata(f).state());
    }
    @Test void archivedInvitationSqlUpdatesAreBlockedAndUniqueCurrentConstraintIsReal() {
        var f = ready(); issue(f);
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("INSERT dbo.beneficiary_invitations(public_id,beneficiary_id,generation,is_current,code_hash,issued_at,expires_at,issued_by_user_id) VALUES (NEWID(),?,2,1,REPLICATE('f',64),SYSUTCDATETIME(),DATEADD(day,7,SYSUTCDATETIME()),?)", f.beneficiary(), f.owner()));
        jdbc.update("UPDATE dbo.vaults SET status='ARCHIVED' WHERE vault_id=?", f.vault());
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("UPDATE dbo.beneficiary_invitations SET is_current=0 WHERE beneficiary_id=?", f.beneficiary()));
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("DELETE dbo.beneficiary_invitations WHERE beneficiary_id=?", f.beneficiary()));
    }

    @Test void ownerEmailChangeRevokesPendingInvitationWithoutRewritingConsumedLink() {
        var f = ready(); var code = issue(f).code();
        owner(f, () -> context.getBean(BeneficiaryService.class).update(f.vaultPublic(), f.beneficiaryPublic(),
                new BeneficiaryDtos.UpsertRequest("Recipient", null, null, null, "new@example.test", null)));
        assertEquals("REVOKED", metadata(f).state());
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, account()));
        var next = reissue(f, 1); var account = account(); link(next.code(), account);
        owner(f, () -> context.getBean(BeneficiaryService.class).update(f.vaultPublic(), f.beneficiaryPublic(),
                new BeneficiaryDtos.UpsertRequest("Recipient", null, null, null, "another@example.test", null)));
        assertEquals("CONSUMED", metadata(f).state());
        assertEquals(1, count("beneficiaries", "beneficiary_id=? AND linked_user_id=?", f.beneficiary(), account.getUserId()));
    }

    @Test void concurrentRevokeAndConsumeCannotCommitBothTerminalStates() throws Exception {
        var f = ready(); var code = issue(f).code(); var account = account();
        var results = concurrent(() -> outcome(() -> { revoke(f); return null; }), () -> outcome(() -> link(code, account)));
        assertEquals(1, results.stream().filter("OK"::equals).count());
        assertTrue(Set.of("REVOKED", "CONSUMED").contains(metadata(f).state()));
        assertEquals(1, audits(f, "BENEFICIARY_INVITATION_REVOKED") + audits(f, "BENEFICIARY_INVITATION_CONSUMED"));
    }

    @Test void auditFailureRollsBackRevocation() {
        var f = ready(); var code = issue(f).code();
        jdbc.execute("CREATE TRIGGER dbo.TR_TestInvitationRevokeAudit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='BENEFICIARY_INVITATION_REVOKED') THROW 51997,'fixture failure',1; END");
        try { assertThrows(RuntimeException.class, () -> revoke(f)); }
        finally { jdbc.execute("DROP TRIGGER dbo.TR_TestInvitationRevokeAudit"); }
        assertEquals("PENDING", metadata(f).state());
        assertEquals("ACCOUNT_CREATED", link(code, account()).accountStatus());
    }

    @Test void actualStaffLinkAndInvitationConsumeSerializeWithoutOverwritingAccount() throws Exception {
        var f = ready(); var code = issue(f).code(); var inviteAccount = account();
        var staffAccount = account("ROLE_STAFF_EXECUTOR"); var counterAccount = account();
        jdbc.update("INSERT dbo.verification_cases(vault_id,triggered_at,assigned_staff_user_id) VALUES (?,SYSUTCDATETIME(),?)", f.vault(), staffAccount.getUserId());
        jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status='VERIFIED_AT_COUNTER' WHERE beneficiary_id=?", f.beneficiary());
        var results = concurrent(() -> outcome(() -> link(code, inviteAccount)), () -> outcome(() -> {
            var security = SecurityContextHolder.createEmptyContext();
            security.setAuthentication(new UsernamePasswordAuthenticationToken(
                    new CustomUserPrincipal(staffAccount.getUserId(), staffAccount.getPublicId(), staffAccount.getEmail()),
                    null, List.of(new SimpleGrantedAuthority("ROLE_STAFF_EXECUTOR"))));
            SecurityContextHolder.setContext(security);
            try { return context.getBean(BeneficiaryAccountService.class).link(f.beneficiaryPublic(),
                    new BeneficiaryAccountDtos.LinkRequest(counterAccount.getEmail())); }
            finally { SecurityContextHolder.clearContext(); }
        }));
        assertEquals(1, results.stream().filter("OK"::equals).count());
        Long winner = results.getFirst().equals("OK") ? inviteAccount.getUserId() : counterAccount.getUserId();
        assertEquals(winner, jdbc.queryForObject("SELECT linked_user_id FROM dbo.beneficiaries WHERE beneficiary_id=?", Long.class, f.beneficiary()));
        assertEquals(1, audits(f, "BENEFICIARY_INVITATION_CONSUMED") + audits(f, "BENEFICIARY_ACCOUNT_LINKED"));
    }

    @Test void ownerUpdateRefreshesCachedRecipientAndKeepsCommittedAccountLink() {
        var f = ready(); var code = issue(f).code(); var account = account();
        owner(f, () -> tx.execute(status -> {
            var repository = context.getBean(BeneficiaryRepository.class);
            var cached = repository.findById(f.beneficiary()).orElseThrow(); assertFalse(cached.hasAccount());
            // Separate committed transaction represents a link that wins before Owner acquires the Vault lock.
            var separate = new org.springframework.transaction.support.TransactionTemplate(context.getBean(org.springframework.transaction.PlatformTransactionManager.class));
            separate.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            separate.execute(s -> service().linkAccount(code, account.getUserId()));
            var updated = context.getBean(BeneficiaryService.class).update(f.vaultPublic(), f.beneficiaryPublic(),
                    new BeneficiaryDtos.UpsertRequest("Updated recipient", null, null, null, null, null));
            assertTrue(updated.hasAccount()); return null;
        }));
        assertEquals(1, count("beneficiaries", "beneficiary_id=? AND linked_user_id=?", f.beneficiary(), account.getUserId()));
    }

    @Test void staleRevokeRequestCannotRevokeAReissuedGeneration() throws Exception {
        var f = ready(); issue(f); var fresh = reissue(f, 1);
        var mvc = MockMvcBuilders.webAppContextSetup((WebApplicationContext) context).apply(springSecurity()).build();
        String path = "/api/v1/vaults/"+f.vaultPublic()+"/beneficiaries/"+f.beneficiaryPublic()+"/invitation";
        mvc.perform(delete(path).param("generation", "1").with(authentication(auth(f))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BENEFICIARY_INVITATION_STALE"));
        assertEquals(fresh.invitation(), metadata(f));
        assertEquals("ACCOUNT_CREATED", link(fresh.code(), account()).accountStatus());
    }

    @Test void waitingForTargetAccountMustNotHoldTheVaultLock() throws Exception {
        var f = ready(); var code = issue(f).code(); var account = account();
        var beforeAccountLock = new CountDownLatch(1); var releaseAccountQuery = new CountDownLatch(1);
        var realUsers = context.getBean(UserRepository.class);
        var interceptedUsers = org.mockito.Mockito.mock(UserRepository.class);
        org.mockito.Mockito.when(interceptedUsers.findActiveAccountForUpdate(account.getUserId())).thenAnswer(call -> {
            beforeAccountLock.countDown();
            assertTrue(releaseAccountQuery.await(10, TimeUnit.SECONDS));
            return realUsers.findActiveAccountForUpdate(account.getUserId());
        });
        var instrumented = new BeneficiaryInvitationService(
                context.getBean(BeneficiaryInvitationRepository.class), context.getBean(BeneficiaryRepository.class),
                context.getBean(com.legacyvault.common.security.OwnerContextService.class),
                context.getBean(com.legacyvault.vault.service.VaultService.class),
                context.getBean(com.legacyvault.vault.repository.VaultRepository.class), interceptedUsers,
                context.getBean(com.legacyvault.user.repository.UserRoleRepository.class),
                context.getBean(com.legacyvault.user.repository.RoleRepository.class),
                context.getBean(InvitationTokens.class), entities, context.getBean(com.legacyvault.common.audit.AuditService.class));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var linking = pool.submit(() -> tx.execute(s -> instrumented.linkAccount(code, account.getUserId())));
            var fresh = new java.util.concurrent.atomic.AtomicReference<InvitationDtos.Issued>();
            try {
                assertTrue(beforeAccountLock.await(10, TimeUnit.SECONDS));
                var ownerWrite = pool.submit(() -> reissue(f, 1));
                assertDoesNotThrow(() -> fresh.set(ownerWrite.get(3, TimeUnit.SECONDS)),
                        "Waiting for a User lock must not retain a Vault lock (Owner writers use User -> Vault)");
            } finally {
                releaseAccountQuery.countDown();
            }
            var failure = assertThrows(ExecutionException.class, () -> linking.get(10, TimeUnit.SECONDS));
            assertEquals(ErrorCode.BENEFICIARY_INVITATION_INVALID,
                    assertInstanceOf(BusinessException.class, failure.getCause()).getErrorCode());
            assertEquals(fresh.get().invitation(), metadata(f));
            assertEquals(0, count("user_roles", "user_id=?", account.getUserId()));
            assertEquals("ACCOUNT_CREATED", link(fresh.get().code(), account).accountStatus());
        }
    }

    @Test void emailUpdateAuditFailureRestoresEmailInvitationAndRevocationAudit() {
        var f = ready(); var issued = issue(f);
        jdbc.execute("CREATE TRIGGER dbo.TR_TestRecipientUpdateAudit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='BENEFICIARY_UPDATED') THROW 51998,'fixture failure',1; END");
        try {
            assertThrows(RuntimeException.class, () -> owner(f, () -> context.getBean(BeneficiaryService.class).update(
                    f.vaultPublic(), f.beneficiaryPublic(), new BeneficiaryDtos.UpsertRequest("Changed recipient", null, null, null, "changed@example.test", null))));
        } finally { jdbc.execute("DROP TRIGGER dbo.TR_TestRecipientUpdateAudit"); }
        assertEquals(issued.invitation(), metadata(f));
        assertEquals(1, count("beneficiaries", "beneficiary_id=? AND email IS NULL AND full_name='Recipient without email'", f.beneficiary()));
        assertEquals(0, audits(f, "BENEFICIARY_INVITATION_REVOKED"));
        assertEquals("ACCOUNT_CREATED", link(issued.code(), account()).accountStatus());
    }

    @Test void failedRoleInsertRollsBackLinkConsumptionAndAudit() {
        var f = ready(); var code = issue(f).code(); var account = account();
        jdbc.execute("CREATE TRIGGER dbo.TR_TestInvitationRole ON dbo.user_roles AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE user_id="+account.getUserId()+") THROW 51999,'fixture failure',1; END");
        try { assertThrows(RuntimeException.class, () -> link(code, account)); }
        finally { jdbc.execute("DROP TRIGGER dbo.TR_TestInvitationRole"); }
        assertEquals("PENDING", metadata(f).state());
        assertEquals(0, count("user_roles", "user_id=?", account.getUserId()));
        assertEquals(1, count("beneficiaries", "beneficiary_id=? AND linked_user_id IS NULL AND account_status='NOT_CREATED'", f.beneficiary()));
        assertEquals(0, audits(f, "BENEFICIARY_INVITATION_CONSUMED"));
        assertEquals("ACCOUNT_CREATED", link(code, account).accountStatus());
    }

    @Test void invalidCodeRollsBackAccountCreatedInTheOuterSignupTransaction() {
        UUID publicId = UUID.randomUUID();
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> tx.execute(s -> {
            User user = new User(); user.setPublicId(publicId); user.setFullName("Signup fixture");
            user.setEmail(publicId+"@example.test"); user.setPasswordHash("unused"); user.setStatus("ACTIVE");
            user = context.getBean(UserRepository.class).saveAndFlush(user);
            return service().linkAccount(context.getBean(InvitationTokens.class).generate(), user.getUserId());
        }));
        assertEquals(0, count("users", "public_id=?", publicId.toString()));
    }

    @Test void staffCreateMustNotHoldVaultWhileWaitingForTheUniqueAccountEmail() throws Exception {
        var f = ready(); var staff = account("ROLE_STAFF_EXECUTOR");
        jdbc.update("INSERT dbo.verification_cases(vault_id,triggered_at,assigned_staff_user_id) VALUES (?,SYSUTCDATETIME(),?)", f.vault(), staff.getUserId());
        jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status='VERIFIED_AT_COUNTER' WHERE beneficiary_id=?", f.beneficiary());
        String email = UUID.randomUUID()+"@example.test";
        var beforeEmailQuery = new CountDownLatch(1); var releaseEmailQuery = new CountDownLatch(1);
        var realUsers = context.getBean(UserRepository.class);
        var interceptedUsers = org.mockito.Mockito.mock(UserRepository.class, org.mockito.AdditionalAnswers.delegatesTo(realUsers));
        org.mockito.Mockito.doAnswer(call -> {
            beforeEmailQuery.countDown(); assertTrue(releaseEmailQuery.await(10, TimeUnit.SECONDS));
            return realUsers.existsByEmail(email);
        }).when(interceptedUsers).existsByEmail(email);
        var instrumented = new BeneficiaryAccountService(context.getBean(BeneficiaryRepository.class),
                context.getBean(com.legacyvault.common.security.StaffContextService.class),
                context.getBean(com.legacyvault.verification.service.StaffVaultCaseGuard.class), entities,
                interceptedUsers, context.getBean(com.legacyvault.user.repository.RoleRepository.class),
                context.getBean(com.legacyvault.user.repository.UserRoleRepository.class),
                context.getBean(org.springframework.security.crypto.password.PasswordEncoder.class),
                context.getBean(com.legacyvault.common.audit.AuditService.class),
                context.getBean(com.legacyvault.beneficiary.BeneficiaryInvitationService.class));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var creation = pool.submit(() -> {
                var security = SecurityContextHolder.createEmptyContext();
                security.setAuthentication(new UsernamePasswordAuthenticationToken(new CustomUserPrincipal(staff.getUserId(), staff.getPublicId(), staff.getEmail()), null,
                        List.of(new SimpleGrantedAuthority("ROLE_STAFF_EXECUTOR"))));
                SecurityContextHolder.setContext(security);
                try { return tx.execute(s -> instrumented.create(f.beneficiaryPublic(), new BeneficiaryAccountDtos.CreateRequest(email, "S3cret-pass", null))); }
                finally { SecurityContextHolder.clearContext(); }
            });
            try {
                assertTrue(beforeEmailQuery.await(10, TimeUnit.SECONDS));
                var ownerWrite = pool.submit(() -> owner(f, () -> context.getBean(BeneficiaryService.class).create(f.vaultPublic(),
                        new BeneficiaryDtos.UpsertRequest("Independent recipient", null, null, null, null, null))));
                assertDoesNotThrow(() -> ownerWrite.get(3, TimeUnit.SECONDS), "Unique email waits must precede Vault write locks");
            } finally { releaseEmailQuery.countDown(); }
            assertEquals("ACCOUNT_CREATED", creation.get(10, TimeUnit.SECONDS).accountStatus());
        }
    }

    @Test void staffCreateRollsBackNewAccountWhenTheCaseClosesAfterPreflight() {
        var f = ready(); var actor = account("ROLE_STAFF_EXECUTOR"); prepareCounter(f, actor);
        String email = UUID.randomUUID()+"@example.test";
        var realUsers = context.getBean(UserRepository.class);
        var interceptedUsers = org.mockito.Mockito.mock(UserRepository.class, org.mockito.AdditionalAnswers.delegatesTo(realUsers));
        org.mockito.Mockito.doAnswer(call -> {
            User saved = realUsers.saveAndFlush(call.getArgument(0));
            var independent = new org.springframework.transaction.support.TransactionTemplate(context.getBean(org.springframework.transaction.PlatformTransactionManager.class));
            independent.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            independent.execute(s -> jdbc.update("UPDATE dbo.verification_cases SET status='CANCELLED' WHERE vault_id=?", f.vault()));
            return saved;
        }).when(interceptedUsers).saveAndFlush(org.mockito.ArgumentMatchers.any(User.class));
        assertCode(ErrorCode.RESOURCE_NOT_FOUND, () -> staff(actor, () -> tx.execute(s -> counterWithUsers(interceptedUsers).create(
                f.beneficiaryPublic(), new BeneficiaryAccountDtos.CreateRequest(email, "S3cret-pass", null)))));
        assertEquals(0, count("users", "email=?", email));
        assertEquals(1, count("verification_cases", "vault_id=? AND status='CANCELLED'", f.vault()));
        assertEquals(1, count("beneficiaries", "beneficiary_id=? AND linked_user_id IS NULL", f.beneficiary()));
        assertEquals(0, audits(f, "BENEFICIARY_ACCOUNT_CREATED"));
    }

    @Test void staffCreateAuditFailureRollsBackTheNewAccountRoleAndLink() {
        var f = ready(); var actor = account("ROLE_STAFF_EXECUTOR"); prepareCounter(f, actor);
        String email = UUID.randomUUID()+"@example.test";
        jdbc.execute("CREATE TRIGGER dbo.TR_TestCounterCreateAudit ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='BENEFICIARY_ACCOUNT_CREATED') THROW 51994,'fixture failure',1; END");
        try {
            assertThrows(RuntimeException.class, () -> staff(actor, () -> context.getBean(BeneficiaryAccountService.class).create(
                    f.beneficiaryPublic(), new BeneficiaryAccountDtos.CreateRequest(email, "S3cret-pass", null))));
        } finally { jdbc.execute("DROP TRIGGER dbo.TR_TestCounterCreateAudit"); }
        assertEquals(0, count("users", "email=?", email));
        assertEquals(1, count("beneficiaries", "beneficiary_id=? AND linked_user_id IS NULL AND account_status='NOT_CREATED'", f.beneficiary()));
        assertEquals(0, audits(f, "BENEFICIARY_ACCOUNT_CREATED"));
    }

    // PS-88: counter read model and the interaction between a counter link and a pending invitation.
    private UUID caseOf(F f) {
        return jdbc.queryForObject("SELECT public_id FROM dbo.verification_cases WHERE vault_id=?", UUID.class, f.vault());
    }

    @Test void counterLinkRevokesAPendingInvitationSoTheSharedCodeCannotBeReused() {
        var f = ready(); var code = issue(f).code(); var actor = account("ROLE_STAFF_EXECUTOR"); prepareCounter(f, actor);
        var target = account(); var other = account();
        var linked = staff(actor, () -> context.getBean(BeneficiaryAccountService.class).link(f.beneficiaryPublic(),
                new BeneficiaryAccountDtos.LinkRequest(target.getEmail())));

        assertEquals("ACCOUNT_CREATED", linked.accountStatus());
        assertEquals("REVOKED", metadata(f).state());
        assertEquals(1, audits(f, "BENEFICIARY_INVITATION_REVOKED"));
        assertCode(ErrorCode.BENEFICIARY_INVITATION_INVALID, () -> link(code, other));
        assertEquals(target.getUserId(), jdbc.queryForObject("SELECT linked_user_id FROM dbo.beneficiaries WHERE beneficiary_id=?",
                Long.class, f.beneficiary()));
    }

    @Test void counterCreateWithoutAnyInvitationStillWorksAndDoesNotInventOne() {
        var f = ready(); var actor = account("ROLE_STAFF_EXECUTOR"); prepareCounter(f, actor);
        String email = UUID.randomUUID() + "@example.test";
        var created = staff(actor, () -> context.getBean(BeneficiaryAccountService.class).create(f.beneficiaryPublic(),
                new BeneficiaryAccountDtos.CreateRequest(email, "S3cret-pass", null)));

        assertEquals("ACCOUNT_CREATED", created.accountStatus());
        assertEquals("NOT_ISSUED", metadata(f).state());
        assertEquals(0, audits(f, "BENEFICIARY_INVITATION_REVOKED"));
    }

    @Test void counterListReportsStepInvitationAndActionsFromRealData() {
        var f = ready(); var actor = account("ROLE_STAFF_EXECUTOR"); prepareCounter(f, actor);
        UUID unverifiedPublic = UUID.randomUUID();
        jdbc.update("INSERT dbo.beneficiaries(public_id,vault_id,full_name) VALUES (?,?,'Not yet verified')", unverifiedPublic.toString(), f.vault());
        issue(f);
        var counter = context.getBean(CounterBeneficiaryService.class);
        UUID caseId = caseOf(f);

        var before = staff(actor, () -> counter.list(caseId));
        assertEquals(2, before.size());
        var verified = before.stream().filter(i -> i.beneficiaryId().equals(f.beneficiaryPublic())).findFirst().orElseThrow();
        assertEquals("AWAITING_ACCOUNT_DECISION", verified.counterStep());
        assertEquals("PENDING", verified.invitation().state());
        assertTrue(verified.actions().canLinkAccount() && verified.actions().canCreateAccount() && verified.actions().canHandOverWithoutAccount());
        var waiting = before.stream().filter(i -> i.beneficiaryId().equals(unverifiedPublic)).findFirst().orElseThrow();
        assertEquals("AWAITING_IDENTITY_VERIFICATION", waiting.counterStep());
        assertEquals("NOT_ISSUED", waiting.invitation().state());
        assertFalse(waiting.actions().canLinkAccount() || waiting.actions().canCreateAccount() || waiting.actions().canHandOverWithoutAccount());

        var target = account();
        staff(actor, () -> context.getBean(BeneficiaryAccountService.class).link(f.beneficiaryPublic(),
                new BeneficiaryAccountDtos.LinkRequest(target.getEmail())));
        var after = staff(actor, () -> counter.get(caseId, f.beneficiaryPublic()));
        assertEquals("ACCOUNT_LINKED", after.counterStep());
        assertTrue(after.accountLinked());
        assertEquals("REVOKED", after.invitation().state());
        assertFalse(after.actions().canLinkAccount() || after.actions().canCreateAccount());
        assertTrue(after.actions().canHandOverWithoutAccount());
    }

    @Test void counterListIsHiddenFromOtherStaffClosedCasesAndOtherVaults() {
        var f = ready(); var actor = account("ROLE_STAFF_EXECUTOR"); prepareCounter(f, actor);
        var stranger = account("ROLE_STAFF_EXECUTOR"); var elsewhere = ready();
        var counter = context.getBean(CounterBeneficiaryService.class);
        UUID caseId = caseOf(f);

        assertCode(ErrorCode.RESOURCE_NOT_FOUND, () -> staff(stranger, () -> counter.list(caseId)));
        assertCode(ErrorCode.RESOURCE_NOT_FOUND, () -> staff(actor, () -> counter.get(caseId, elsewhere.beneficiaryPublic())));
        jdbc.update("UPDATE dbo.verification_cases SET status='CANCELLED', closed_at=SYSUTCDATETIME() WHERE vault_id=?", f.vault());
        assertCode(ErrorCode.RESOURCE_NOT_FOUND, () -> staff(actor, () -> counter.list(caseId)));
    }
}
