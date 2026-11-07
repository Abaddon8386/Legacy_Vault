package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import com.legacyvault.beneficiary.BeneficiaryInvitationService;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.beneficiary.CounterIdentityAttestationDtos;
import com.legacyvault.beneficiary.CounterIdentityAttestationService;
import com.legacyvault.beneficiary.StaffInvitationEmailService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;

/**
 * PS-140 on real SQL Server (V58): a counter identity attestation needs no manual evidence reference. The attestation
 * row itself (assigned Staff, server UTC time, case, Beneficiary, optional confirmed email) is the evidence.
 */
class CounterAttestationOptionalReferenceSqlServerTest extends HandoverCompletionSqlSupport {

    private record Ctx(Ready ready, User staff, UUID caseId, UUID recipient, long recipientId) { }

    private static User account(String role, String email) {
        UUID uuid = UUID.randomUUID();
        long id = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES (?,'PS-140 fixture',?,'unused','ACTIVE')",
                Long.class, uuid.toString(), email != null ? email : uuid + "@example.test");
        if (role != null) {
            jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code=?", id, role);
        }
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
        User staff = account("ROLE_STAFF_EXECUTOR", null);
        jdbc.update("UPDATE dbo.verification_cases SET assigned_staff_user_id=? WHERE verification_case_id=?",
                staff.getUserId(), ready.f().caseId());
        // The shared fixture pre-verifies recipients; only a Staff attestation may make this one verified here.
        jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status='NOT_VERIFIED' WHERE vault_id=?", ready.f().vaultId());
        long recipientId = jdbc.queryForObject("SELECT beneficiary_id FROM dbo.beneficiaries WHERE public_id=?",
                Long.class, ready.recipient().toString());
        return new Ctx(ready, staff, ready.f().publicCaseId(), ready.recipient(), recipientId);
    }

    private static void attest(Ctx c, String reference, String email) {
        asStaff(c.staff(), () -> context.getBean(CounterIdentityAttestationService.class)
                .attest(c.caseId(), c.recipient(), new CounterIdentityAttestationDtos.Request(reference, email)));
    }

    private static List<String> storedReferences(Ctx c) {
        return jdbc.query("SELECT evidence_reference FROM dbo.beneficiary_counter_attestations WHERE beneficiary_id=? ORDER BY attestation_id",
                (rs, i) -> rs.getString(1), c.recipientId());
    }

    private static String status(Ctx c) {
        return jdbc.queryForObject("SELECT id_verification_status FROM dbo.beneficiaries WHERE beneficiary_id=?", String.class, c.recipientId());
    }

    private static ErrorCode code(Runnable work) {
        return assertThrows(BusinessException.class, work::run).getErrorCode();
    }

    /** AC 1, 2, 3 */
    @Test
    void attestationWithoutReferenceSucceedsAndOldClientsKeepTheirReference() {
        var c = ctx();
        attest(c, null, null);
        attest(c, "", null);
        attest(c, "   ", null);
        attest(c, "  COUNTER-17  ", "ref@example.test");

        assertEquals(java.util.Arrays.asList(null, null, null, "COUNTER-17"), storedReferences(c));
        assertEquals("VERIFIED_AT_COUNTER", status(c));
        assertEquals(4, count("audit_logs", "vault_id=? AND action='BENEFICIARY_COUNTER_ATTESTED'", c.ready().f().vaultId()));
        // The audit records only whether a reference existed, never invented one.
        assertEquals(3, count("audit_logs", "vault_id=? AND action='BENEFICIARY_COUNTER_ATTESTED' AND details LIKE '%\"evidenceReferenceRecorded\":false%'", c.ready().f().vaultId()));
    }

    /** AC 3: no fake data can enter through the database either; the table stays immutable. */
    @Test
    void databaseRefusesBlankReferenceAndKeepsAttestationsImmutable() {
        var c = ctx();
        attest(c, null, null);
        assertThrows(DataAccessException.class, () -> jdbc.update(
                "INSERT dbo.beneficiary_counter_attestations(verification_case_id,beneficiary_id,staff_user_id,evidence_reference) VALUES (?,?,?,'   ')",
                c.ready().f().caseId(), c.recipientId(), c.staff().getUserId()));
        assertThrows(DataAccessException.class, () -> jdbc.update(
                "UPDATE dbo.beneficiary_counter_attestations SET evidence_reference='X' WHERE beneficiary_id=?", c.recipientId()));
        assertEquals(java.util.Arrays.asList((String) null), storedReferences(c));
    }

    /** AC 4, 5 */
    @Test
    void wrongStaffAndWrongRecipientAreRejectedAndWriteNothing() {
        var c = ctx();
        User otherStaff = account("ROLE_STAFF_EXECUTOR", null);
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, code(() -> asStaff(otherStaff, () -> context.getBean(CounterIdentityAttestationService.class)
                .attest(c.caseId(), c.recipient(), new CounterIdentityAttestationDtos.Request(null, null)))));

        var other = ctx(); // different vault and case
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, code(() -> asStaff(c.staff(), () -> context.getBean(CounterIdentityAttestationService.class)
                .attest(c.caseId(), other.recipient(), new CounterIdentityAttestationDtos.Request(null, null)))));

        assertEquals(0, storedReferences(c).size());
        assertEquals(0, storedReferences(other).size());
        assertTrue(!"VERIFIED_AT_COUNTER".equals(status(c)));
    }

    /** AC 4: no attestation (even though the reference is optional) means no invitation email and no link. */
    @Test
    void withoutAnAttestationNothingIsIssuedAndMakingOneWithoutEmailStillNeedsTheConfirmedAddress() {
        var c = ctx();
        assertEquals(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED, code(() -> asStaff(c.staff(),
                () -> context.getBean(StaffInvitationEmailService.class).request(c.caseId(), c.recipient(), 0))));

        attest(c, null, null);
        assertEquals(ErrorCode.BENEFICIARY_INVITATION_COUNTER_EMAIL_REQUIRED, code(() -> asStaff(c.staff(),
                () -> context.getBean(StaffInvitationEmailService.class).request(c.caseId(), c.recipient(), 0))));
        assertEquals(0, count("beneficiary_invitations", "beneficiary_id=?", c.recipientId()));
    }

    /** AC 8: a failing audit write rolls the attestation and the identity status back. */
    @Test
    void auditFailureRollsBackAttestationAndIdentityStatus() {
        var c = ctx();
        jdbc.execute("CREATE TRIGGER dbo.TR_ps140_fail_audit ON dbo.audit_logs AFTER INSERT AS THROW 50001, 'forced failure', 1");
        try {
            assertThrows(RuntimeException.class, () -> attest(c, null, "rollback@example.test"));
        } finally {
            jdbc.execute("DROP TRIGGER dbo.TR_ps140_fail_audit");
        }
        assertEquals(0, storedReferences(c).size());
        assertTrue(!"VERIFIED_AT_COUNTER".equals(status(c)));
        attest(c, null, "rollback@example.test");
        assertEquals(1, storedReferences(c).size());
    }

    /** AC 1, 9: the invitation email request accepts an attestation that has no reference. */
    @Test
    void invitationEmailRequestPassesItsGateOnAnAttestationWithoutReference() {
        var c = ctx();
        attest(c, null, "gate." + UUID.randomUUID() + "@example.test");
        var queued = asStaff(c.staff(), () -> context.getBean(StaffInvitationEmailService.class).request(c.caseId(), c.recipient(), 0));
        assertEquals(1, queued.invitationGeneration());
        assertEquals(1, count("beneficiary_invitation_mail_outbox", "beneficiary_id=?", c.recipientId()));
        assertEquals(0, count("beneficiaries", "beneficiary_id=? AND linked_user_id IS NOT NULL", c.recipientId()));
    }

    /**
     * AC 9: Staff attests without any reference, the invitation is bound to the attested address, the recipient's
     * own account links with it, and the link opens neither content nor any delivery. AC 7: a concurrent double
     * redeem links once and writes one consume audit.
     */
    @Test
    void endToEndAttestationWithoutReferenceThenAccountLinkOpensNothing() throws Exception {
        var c = ctx();
        String email = "ps140." + UUID.randomUUID() + "@example.test";
        attest(c, null, email);

        // Same issuing call the invitation-email service makes from the stored attestation address.
        var issued = tx.execute(s -> {
            var beneficiary = context.getBean(BeneficiaryRepository.class)
                    .findByPublicIdAndVault_VaultId(c.recipient(), c.ready().f().vaultId()).orElseThrow();
            return context.getBean(BeneficiaryInvitationService.class)
                    .issueBoundForStaff(beneficiary, email, c.staff().getUserId(), 0);
        });
        User recipientAccount = account(null, email);

        var barrier = new CyclicBarrier(2);
        Callable<Object> redeem = () -> {
            barrier.await(5, TimeUnit.SECONDS);
            try {
                return tx.execute(s -> context.getBean(BeneficiaryInvitationService.class)
                        .redeemBoundAccount(issued.code(), recipientAccount.getUserId()));
            } catch (BusinessException ex) {
                return ex.getErrorCode();
            }
        };
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(redeem);
            var b = pool.submit(redeem);
            a.get(30, TimeUnit.SECONDS);
            b.get(30, TimeUnit.SECONDS);
        }

        assertEquals(recipientAccount.getUserId(), jdbc.queryForObject("SELECT linked_user_id FROM dbo.beneficiaries WHERE beneficiary_id=?", Long.class, c.recipientId()));
        assertEquals(1, count("audit_logs", "action='BENEFICIARY_INVITATION_CONSUMED' AND vault_id=?", c.ready().f().vaultId()));
        assertNull(storedReferences(c).get(0));
        // Linking is not delivery and does not unlock content.
        assertEquals(0, count("handover_items", "handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)", c.ready().session().toString()));
        assertEquals("UNLOCKED", jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?", String.class, c.ready().f().vaultId()));
    }
}
