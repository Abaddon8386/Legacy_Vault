package com.legacyvault.verification;

import com.legacyvault.verification.group.GroupHandoverService;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
/** PS-125: reopening only through a Staff request and a Legal decision, roles and scope, on real SQL Server and real HTTP. */
class GroupHandoverReopenSqlServerTest extends GroupHandoverSqlSupport {

    private int items(Two t) {
        return count("handover_items", "handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)",
                t.sessionId());
    }

    private int events(Two t) { return count("handover_group_events", "case_id=?", t.f().caseId()); }
    // AC3 — completing the list is not enough: Staff request, then a Legal decision.
    @Test
    void completeAttendanceStillNeedsStaffRequestAndLegalDecisionByTheRightRoles() throws Exception {
        var t = two();
        attendance(t, Set.of(t.recA()));
        var legal = newUser("LEGAL_VERIFIER");
        var admin = newUser("ADMIN");
        var beneficiary = beneficiaryUser(t.benA());

        attendance(t, both(t));
        assertThat(json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200).get("state").get("status").asText())
                .isEqualTo("SUSPENDED"); // bringing everyone does not lift it
        expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED");

        // Legal cannot open anything without a Staff request.
        long revision = revision(t);
        expect(decide(t, legal, UUID.randomUUID(), "APPROVE", revision), 409, "GROUP_HANDOVER_BLOCKED");

        var request = reopenRequest(t);
        UUID requestId = UUID.fromString(request.get("state").get("requestId").asText());
        assertThat(request.get("state").get("status").asText()).isEqualTo("AWAITING_LEGAL");
        expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED");
        long awaiting = revision(t);

        // Wrong roles are refused before any state changes; Staff cannot lift the lock.
        expect(decide(t, new User(t.staff().userId(), t.staff().publicId(), t.staff().email(), t.staff().token()), requestId, "APPROVE", awaiting), 403, null);
        expect(decide(t, admin, requestId, "APPROVE", awaiting), 403, null);
        expect(decide(t, beneficiary, requestId, "APPROVE", awaiting), 403, null);
        expect(http("POST", staffBase(t) + "/group-handover/reopen-requests", report(awaiting, null, "x"), legal.token(), UUID.randomUUID()), 403, null);
        expect(http("POST", staffBase(t) + "/group-handover/attendance", report(awaiting, both(t), "x"), admin.token(), UUID.randomUUID()), 403, null);
        // Wrong session or case is 404, not a leak.
        expect(http("POST", "/legal-verifications/verification-cases/" + t.caseId() + "/handover-sessions/" + UUID.randomUUID()
                + "/group-handover/reopen-requests/" + requestId + "/decision",
                java.util.Map.of("expectedRevision", awaiting, "decision", "APPROVE", "reason", "x"), legal.token(), UUID.randomUUID()), 404, null);
        expect(http("POST", "/legal-verifications/verification-cases/" + UUID.randomUUID() + "/handover-sessions/" + t.sessionId()
                + "/group-handover/reopen-requests/" + requestId + "/decision",
                java.util.Map.of("expectedRevision", awaiting, "decision", "APPROVE", "reason", "x"), legal.token(), UUID.randomUUID()), 404, null);
        assertThat(revision(t)).isEqualTo(awaiting);
        assertThat(items(t)).isZero();

        // The decision only lifts this gate: it does not deliver anything or close the case.
        var approved = json(decide(t, legal, requestId, "APPROVE", awaiting), 200);
        assertThat(approved.get("state").get("status").asText()).isEqualTo("READY");
        assertThat(items(t)).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?", String.class, t.f().vaultId())).isEqualTo("UNLOCKED");
        json(deliver(t, t.recA(), t.assetA()), 201);
        json(deliver(t, t.recB(), t.assetB()), 201);
        assertThat(items(t)).isEqualTo(2);
    }

    @Test
    void rejectedRequestLeavesTheWholeCaseSuspended() throws Exception {
        var t = two();
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        var legal = newUser("LEGAL_VERIFIER");
        var request = reopenRequest(t);
        UUID requestId = UUID.fromString(request.get("state").get("requestId").asText());
        var rejected = json(decide(t, legal, requestId, "REJECT", revision(t)), 200);
        assertThat(rejected.get("state").get("status").asText()).isEqualTo("SUSPENDED");
        expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED");
        // A decided request cannot be decided again.
        expect(decide(t, legal, requestId, "APPROVE", revision(t)), 409, "GROUP_HANDOVER_BLOCKED");
        assertThat(items(t)).isZero();
    }

    // AC4 — only a current request and current attendance may be approved.
    @Test
    void replacedAttendanceOrChangedScopeInvalidatesThePendingRequest() throws Exception {
        var t = two();
        var legal = newUser("LEGAL_VERIFIER");
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        UUID first = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());

        // A newer report replaces the old one and cancels the pending request.
        attendance(t, both(t));
        expect(decide(t, legal, first, "APPROVE", revision(t)), 409, "GROUP_HANDOVER_BLOCKED");

        // The request is new again, but the approved scope then changes: the old fingerprint no longer applies.
        UUID second = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        long revision = revision(t);
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET updated_at=DATEADD(SECOND,5,updated_at) WHERE verification_case_id=?", t.f().caseId());
        expect(decide(t, legal, second, "APPROVE", revision), 409, "GROUP_HANDOVER_BLOCKED");
        expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED");
        assertThat(items(t)).isZero();
    }
}
