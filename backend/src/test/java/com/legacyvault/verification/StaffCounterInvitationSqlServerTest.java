package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.legacyvault.beneficiary.CounterBeneficiaryService;
import com.legacyvault.beneficiary.CounterIdentityAttestationDtos;
import com.legacyvault.beneficiary.CounterIdentityAttestationService;
import com.legacyvault.beneficiary.StaffInvitationEmailService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * PS-88 (ST-14, ST-24, ST-25): Staff counter confirmation and invitation-email request on real SQL Server.
 * The recipient is an allocation recipient of a COURT-approved, UNLOCKED case, so these tests also show that the
 * email request never replaces Legal approval, and that handover without account/invitation still works.
 */
class StaffCounterInvitationSqlServerTest extends HandoverCompletionSqlSupport {

    private record Ctx(Ready ready, User staff, UUID caseId, UUID recipient, long recipientId) { }

    private static User account(String role) {
        UUID uuid = UUID.randomUUID();
        long id = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES (?,'Counter fixture',?,'unused','ACTIVE')",
                Long.class, uuid.toString(), uuid + "@example.test");
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code=?", id, role);
        return tx.execute(s -> context.getBean(UserRepository.class).findById(id).orElseThrow());
    }

    private static <T> T asStaff(User actor, Supplier<T> call) {
        var previous = SecurityContextHolder.getContext();
        var security = SecurityContextHolder.createEmptyContext();
        security.setAuthentication(new UsernamePasswordAuthenticationToken(
                new CustomUserPrincipal(actor.getUserId(), actor.getPublicId(), actor.getEmail()),
                null, List.of(new SimpleGrantedAuthority("ROLE_STAFF_EXECUTOR"))));
        SecurityContextHolder.setContext(security);
        try {
            return call.get();
        } finally {
            SecurityContextHolder.setContext(previous);
        }
    }

    private static Ctx ctx() {
        var ready = ready(false);
        User staff = account("ROLE_STAFF_EXECUTOR");
        jdbc.update("UPDATE dbo.verification_cases SET assigned_staff_user_id=? WHERE verification_case_id=?",
                staff.getUserId(), ready.f().caseId());
        long recipientId = jdbc.queryForObject("SELECT beneficiary_id FROM dbo.beneficiaries WHERE public_id=?",
                Long.class, ready.recipient().toString());
        return new Ctx(ready, staff, ready.f().publicCaseId(), ready.recipient(), recipientId);
    }

    private static void attest(Ctx c, String email) {
        asStaff(c.staff(), () -> context.getBean(CounterIdentityAttestationService.class).attest(c.caseId(), c.recipient(),
                new CounterIdentityAttestationDtos.Request("Counter record " + UUID.randomUUID(), email)));
    }

    private static com.legacyvault.beneficiary.InvitationEmailDtos.Queued request(Ctx c, int generation) {
        return asStaff(c.staff(), () -> context.getBean(StaffInvitationEmailService.class)
                .request(c.caseId(), c.recipient(), generation));
    }

    private static ErrorCode codeOf(Ctx c, int generation) {
        return assertThrows(BusinessException.class, () -> request(c, generation)).getErrorCode();
    }

    private static int outboxRows(Ctx c) {
        return count("beneficiary_invitation_mail_outbox", "beneficiary_id=?", c.recipientId());
    }

    private static int invitationRows(Ctx c) {
        return count("beneficiary_invitations", "beneficiary_id=?", c.recipientId());
    }

    @Test
    void queuedOnlyAfterStaffAttestationAndTheEmailIsBoundToTheConfirmedAddress() {
        var c = ctx();
        var counter = context.getBean(CounterBeneficiaryService.class);

        var before = asStaff(c.staff(), () -> counter.get(c.caseId(), c.recipient()));
        assertEquals("NOT_ISSUED", before.invitation().state());
        assertEquals(0, before.invitation().generation());
        assertFalse(before.counterAttestation().recorded());
        assertFalse(before.actions().canRequestInvitationEmail());
        assertTrue(before.actions().canHandOverWithoutAccount());

        attest(c, "Recipient.Counter@Example.TEST");
        var attested = asStaff(c.staff(), () -> counter.get(c.caseId(), c.recipient()));
        assertTrue(attested.counterAttestation().recorded());
        assertTrue(attested.counterAttestation().confirmedEmailRecorded());
        assertNotNull(attested.counterAttestation().recordedAt());
        assertTrue(attested.actions().canRequestInvitationEmail());

        var queued = request(c, attested.invitation().generation());

        assertEquals(1, queued.invitationGeneration());
        assertEquals(1, outboxRows(c));
        assertEquals("recipient.counter@example.test", jdbc.queryForObject(
                "SELECT recipient_email FROM dbo.beneficiary_invitations WHERE beneficiary_id=? AND is_current=1",
                String.class, c.recipientId()));
        assertEquals(1, count("audit_logs", "vault_id=? AND action=?", c.ready().f().vaultId(), "BENEFICIARY_COUNTER_ATTESTED"));
        assertEquals(1, count("audit_logs", "vault_id=? AND action=?", c.ready().f().vaultId(), "BENEFICIARY_INVITATION_EMAIL_QUEUED"));
        // The email request never verifies identity, links an account or grants access.
        assertEquals(0, count("beneficiaries", "beneficiary_id=? AND linked_user_id IS NOT NULL", c.recipientId()));

        var after = asStaff(c.staff(), () -> counter.get(c.caseId(), c.recipient()));
        assertEquals(1, after.invitation().generation());
        assertEquals("PENDING", after.invitation().state());
        assertFalse(after.actions().canRequestInvitationEmail(), "a Staff-bound code is already queued");
    }

    @Test
    void retryWithTheSameGenerationIsIdempotentAndAStaleGenerationChangesNothing() {
        var c = ctx();
        attest(c, "retry@example.test");

        var first = request(c, 0);
        var retry = request(c, 0);

        assertEquals(first.outboxId(), retry.outboxId());
        assertEquals(1, outboxRows(c));
        assertEquals(1, invitationRows(c));
        assertEquals(1, count("audit_logs", "vault_id=? AND action=?", c.ready().f().vaultId(), "BENEFICIARY_INVITATION_EMAIL_QUEUED"));

        var other = ctx();
        attest(other, "stale@example.test");
        assertEquals(ErrorCode.BENEFICIARY_INVITATION_STALE, codeOf(other, 3));
        assertEquals(0, outboxRows(other));
        assertEquals(0, invitationRows(other));
    }

    @Test
    void withoutStaffAttestationOrConfirmedEmailNothingIsIssued() {
        var c = ctx();
        assertEquals(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED, codeOf(c, 0));

        attest(c, null);
        assertEquals(ErrorCode.BENEFICIARY_INVITATION_COUNTER_EMAIL_REQUIRED, codeOf(c, 0));
        assertEquals(0, outboxRows(c));
        assertEquals(0, invitationRows(c));

        var read = asStaff(c.staff(), () -> context.getBean(CounterBeneficiaryService.class).get(c.caseId(), c.recipient()));
        assertTrue(read.counterAttestation().recorded());
        assertFalse(read.counterAttestation().confirmedEmailRecorded());
        assertFalse(read.actions().canRequestInvitationEmail());
    }

    @Test
    void anAttestationAloneNeverStandsInForTheInPersonVerificationOrAnExistingLink() {
        var c = ctx();
        attest(c, "unverified@example.test");

        jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status='NOT_VERIFIED' WHERE beneficiary_id=?", c.recipientId());
        assertEquals(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED, codeOf(c, 0));
        assertEquals(0, outboxRows(c));

        jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status='VERIFIED_AT_COUNTER' WHERE beneficiary_id=?", c.recipientId());
        long account = account("ROLE_BENEFICIARY").getUserId();
        jdbc.update("UPDATE dbo.beneficiaries SET linked_user_id=?, account_status='ACCOUNT_CREATED' WHERE beneficiary_id=?", account, c.recipientId());
        assertEquals(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED, codeOf(c, 0));
        assertEquals(0, outboxRows(c));
    }

    @Test
    void resendAfterAStaffBoundInvitationIsCurrentlyRefused() {
        // TODO(open-question): the resend policy (when/how often, new email) is not decided. Today a Staff-bound
        // generation cannot be replaced, so "gui lai" needs a group decision before any behaviour is added.
        var c = ctx();
        attest(c, "resend@example.test");
        request(c, 0);

        assertEquals(ErrorCode.BENEFICIARY_INVITATION_ALREADY_EXISTS, codeOf(c, 1));
        assertEquals(1, outboxRows(c));
        assertEquals(1, invitationRows(c));
    }

    @Test
    void otherStaffClosedCasesAndOtherVaultsAreNotFound() {
        var c = ctx();
        attest(c, "scope@example.test");
        var stranger = account("ROLE_STAFF_EXECUTOR");
        var elsewhere = ctx();

        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, assertThrows(BusinessException.class,
                () -> asStaff(stranger, () -> context.getBean(StaffInvitationEmailService.class).request(c.caseId(), c.recipient(), 0))).getErrorCode());
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, assertThrows(BusinessException.class,
                () -> asStaff(stranger, () -> context.getBean(CounterIdentityAttestationService.class).attest(c.caseId(), c.recipient(),
                        new CounterIdentityAttestationDtos.Request("Counter record", "x@example.test")))).getErrorCode());
        // A Beneficiary of another Vault is not addressable through this case.
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, assertThrows(BusinessException.class,
                () -> asStaff(c.staff(), () -> context.getBean(StaffInvitationEmailService.class).request(c.caseId(), elsewhere.recipient(), 0))).getErrorCode());
        assertEquals(0, outboxRows(c));

        jdbc.update("UPDATE dbo.verification_cases SET status='CANCELLED', closed_at=SYSUTCDATETIME() WHERE verification_case_id=?", c.ready().f().caseId());
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, codeOf(c, 0));
    }

    @Test
    void legalApprovalAndTheApprovedAllocationStillGateTheEmailRequest() {
        // Beneficiary of the same Vault that is not an allocation recipient of the approved basis.
        var c = ctx();
        UUID outsider = UUID.randomUUID();
        long outsiderId = jdbc.queryForObject("INSERT dbo.beneficiaries(public_id,vault_id,full_name,id_verification_status) OUTPUT inserted.beneficiary_id VALUES (?,?,'Outsider','VERIFIED_AT_COUNTER')",
                Long.class, outsider.toString(), c.ready().f().vaultId());
        asStaff(c.staff(), () -> context.getBean(CounterIdentityAttestationService.class).attest(c.caseId(), outsider,
                new CounterIdentityAttestationDtos.Request("Counter record outsider", "outsider@example.test")));
        var failure = assertThrows(BusinessException.class, () -> asStaff(c.staff(),
                () -> context.getBean(StaffInvitationEmailService.class).request(c.caseId(), outsider, 0)));
        assertEquals(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE, failure.getErrorCode());
        assertEquals(0, count("beneficiary_invitation_mail_outbox", "beneficiary_id=?", outsiderId));

        // Not approved/unlocked: Legal gate refuses before any code or outbox row exists.
        var notApproved = LegalBasisSqlServerSupport.fixture(true);
        User staff = account("ROLE_STAFF_EXECUTOR");
        jdbc.update("UPDATE dbo.verification_cases SET assigned_staff_user_id=? WHERE verification_case_id=?", staff.getUserId(), notApproved.caseId());
        UUID recipient = UUID.randomUUID();
        long recipientId = jdbc.queryForObject("INSERT dbo.beneficiaries(public_id,vault_id,full_name,id_verification_status) OUTPUT inserted.beneficiary_id VALUES (?,?,'No approval','VERIFIED_AT_COUNTER')",
                Long.class, recipient.toString(), notApproved.vaultId());
        asStaff(staff, () -> context.getBean(CounterIdentityAttestationService.class).attest(notApproved.publicCaseId(), recipient,
                new CounterIdentityAttestationDtos.Request("Counter record unapproved", "noapproval@example.test")));
        assertThrows(BusinessException.class, () -> asStaff(staff,
                () -> context.getBean(StaffInvitationEmailService.class).request(notApproved.publicCaseId(), recipient, 0)));
        assertEquals(0, count("beneficiary_invitations", "beneficiary_id=?", recipientId));
        assertEquals(0, count("beneficiary_invitation_mail_outbox", "beneficiary_id=?", recipientId));
    }

    @Test
    void concurrentRequestsForTheSameGenerationCreateOneInvitationAndOneOutboxRow() throws Exception {
        var c = ctx();
        attest(c, "race@example.test");

        var barrier = new CyclicBarrier(2);
        Callable<String> task = () -> {
            barrier.await(5, TimeUnit.SECONDS);
            try {
                return request(c, 0).outboxId().toString();
            } catch (BusinessException ex) {
                return ex.getErrorCode().name();
            }
        };
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(task);
            var b = pool.submit(task);
            var results = Arrays.asList(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
            // Both either return the same queued request (idempotent) or the loser is told its generation is stale.
            assertTrue(results.stream().allMatch(r -> r.matches("[0-9a-f-]{36}") || r.equals("BENEFICIARY_INVITATION_STALE")), results.toString());
            assertTrue(results.stream().anyMatch(r -> r.matches("[0-9a-f-]{36}")), results.toString());
        }
        assertEquals(1, outboxRows(c));
        assertEquals(1, invitationRows(c));
    }

    @Test
    void handoverWithoutAnyAccountOrInvitationStillWorksAndEmailNeverReplacesIt() {
        var c = ctx();
        assertEquals(0, invitationRows(c));

        // The handover session was opened by the fixture Staff; hand the case back to them for the delivery.
        jdbc.update("UPDATE dbo.verification_cases SET assigned_staff_user_id=? WHERE verification_case_id=?",
                c.ready().f().userId(), c.ready().f().caseId());
        deliver(c.ready());

        assertEquals(1, count("handover_items", "status IN ('DELIVERED','VERIFIED_BY_BENEFICIARY')"
                + " AND handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)",
                c.ready().session()));
        assertEquals(0, invitationRows(c));
        assertEquals(0, outboxRows(c));
        assertEquals(0, count("beneficiaries", "beneficiary_id=? AND linked_user_id IS NOT NULL", c.recipientId()));
    }
}
