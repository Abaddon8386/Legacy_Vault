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
/** PS-125: first handover and attendance gate (whole-group rule, 30/10/2026) on real SQL Server and real HTTP. */
class GroupHandoverGateSqlServerTest extends GroupHandoverSqlSupport {

    private int items(Two t) {
        return count("handover_items", "handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)",
                t.sessionId());
    }

    private int events(Two t) { return count("handover_group_events", "case_id=?", t.f().caseId()); }
    // AC1 — first handover with a missing recipient: no asset can be delivered, by any route.
    @Test
    void firstHandoverWithoutCompleteAttendanceDeliversNothingByAnyRoute() throws Exception {
        var t = two();
        // No report at all.
        expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED");
        // Only A is present: the whole case is suspended, A cannot receive alone.
        var receipt = attendance(t, Set.of(t.recA()));
        assertThat(receipt.get("state").get("status").asText()).isEqualTo("SUSPENDED");
        expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED");
        expect(deliver(t, t.recB(), t.assetB()), 409, "GROUP_HANDOVER_BLOCKED");
        // Old clients and other write routes cannot bypass the gate.
        expect(http("POST", staffBase(t) + "/close", null, t.staff().token(), null), 409, null);
        expect(http("POST", staffBase(t) + "/receipts", java.util.Map.of("recipientId", t.recA(), "assetIds", List.of(t.assetA())),
                t.staff().token(), null), 409, null);
        expect(http("POST", staffBase(t) + "/archive", null, t.staff().token(), null), 409, null);
        assertThat(items(t)).isZero();
        assertThat(count("handover_receipts", "handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)", t.sessionId())).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?", String.class, t.f().vaultId())).isEqualTo("UNLOCKED");
        assertThat(jdbc.queryForObject("SELECT status FROM dbo.handover_sessions WHERE public_id=?", String.class, t.sessionId())).isEqualTo("OPEN");
        // The report, the suspension and the audit are one atomic write.
        assertThat(events(t)).isEqualTo(1);
        assertThat(count("audit_logs", "vault_id=? AND action='HANDOVER_GROUP_CHANGED'", t.f().vaultId())).isEqualTo(1);
    }

    @Test
    void presentRecipientNeverReceivesAloneEvenWhenSeveralAreMissing() throws Exception {
        var t = two();
        attendance(t, Set.of());
        expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED");
        attendance(t, Set.of(t.recB()));
        expect(deliver(t, t.recB(), t.assetB()), 409, "GROUP_HANDOVER_BLOCKED");
        assertThat(items(t)).isZero();
    }

    @Test
    void staleExpectedRevisionAndMissingRequestOrReasonAreRejected() throws Exception {
        var t = two();
        attendance(t, Set.of(t.recA()));
        expect(http("POST", staffBase(t) + "/group-handover/attendance", report(0, both(t), "Old view"), t.staff().token(), UUID.randomUUID()),
                409, "GROUP_HANDOVER_STALE");
        // Reopen request needs a current all-present report.
        expect(http("POST", staffBase(t) + "/group-handover/reopen-requests", report(revision(t), null, "Not everyone"), t.staff().token(), UUID.randomUUID()),
                409, "GROUP_HANDOVER_BLOCKED");
        expect(http("POST", staffBase(t) + "/group-handover/attendance", report(revision(t), both(t), " "), t.staff().token(), UUID.randomUUID()), 400, null);
        expect(http("POST", staffBase(t) + "/group-handover/attendance", report(revision(t), Set.of(UUID.randomUUID()), "Stranger"), t.staff().token(), UUID.randomUUID()), 400, null);
    }
}
