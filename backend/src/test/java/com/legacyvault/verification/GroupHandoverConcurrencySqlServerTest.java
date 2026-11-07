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
/** PS-125: retry, races, rollback and no time-based change on real SQL Server and real HTTP. */
class GroupHandoverConcurrencySqlServerTest extends GroupHandoverSqlSupport {

    private int items(Two t) {
        return count("handover_items", "handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)",
                t.sessionId());
    }

    private int events(Two t) { return count("handover_group_events", "case_id=?", t.f().caseId()); }
    // Retry / idempotency.
    @Test
    void retryWithTheSameKeyReturnsTheOriginalReceiptAndOnePayloadChangeConflicts() throws Exception {
        var t = two();
        UUID key = UUID.randomUUID();
        var body = report(0, Set.of(t.recA()), "Counter report");
        var first = json(http("POST", staffBase(t) + "/group-handover/attendance", body, t.staff().token(), key), 200);
        var again = json(http("POST", staffBase(t) + "/group-handover/attendance", body, t.staff().token(), key), 200);
        assertThat(again.get("eventId").asText()).isEqualTo(first.get("eventId").asText());
        assertThat(events(t)).isEqualTo(1);
        expect(http("POST", staffBase(t) + "/group-handover/attendance", report(0, both(t), "Different"), t.staff().token(), key), 409, "GROUP_HANDOVER_STALE");
        assertThat(events(t)).isEqualTo(1);
    }

    // Races.
    @Test
    void twoStaffRequestsAtOnceCreateExactlyOneRequest() throws Exception {
        var t = two();
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        long revision = revision(t);
        var results = race(
                () -> http("POST", staffBase(t) + "/group-handover/reopen-requests", report(revision, null, "First"), t.staff().token(), UUID.randomUUID()),
                () -> http("POST", staffBase(t) + "/group-handover/reopen-requests", report(revision, null, "Second"), t.staff().token(), UUID.randomUUID()));
        assertThat(results.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(200, 409);
        assertThat(count("handover_group_events", "case_id=? AND operation='REQUEST'", t.f().caseId())).isEqualTo(1);
        assertThat(revision(t)).isEqualTo(revision + 1);
    }

    @Test
    void twoLegalDecisionsAtOnceDecideTheRequestOnce() throws Exception {
        var t = two();
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        long revision = revision(t);
        var legal = newUser("LEGAL_VERIFIER");
        var other = newUser("LEGAL_VERIFIER");
        var results = race(() -> decide(t, legal, requestId, "APPROVE", revision), () -> decide(t, other, requestId, "REJECT", revision));
        assertThat(results.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(200, 409);
        assertThat(count("handover_group_events", "case_id=? AND operation IN ('APPROVE','REJECT')", t.f().caseId())).isEqualTo(1);
    }

    @Test
    void attendanceChangeRacingALegalDecisionNeverLeavesAnApprovedStaleGate() throws Exception {
        var t = two();
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        long revision = revision(t);
        var legal = newUser("LEGAL_VERIFIER");
        race(() -> decide(t, legal, requestId, "APPROVE", revision),
                () -> http("POST", staffBase(t) + "/group-handover/attendance", report(revision, Set.of(t.recA()), "Someone left"), t.staff().token(), UUID.randomUUID()));
        // Whatever order won, the final gate must not allow delivery while someone is missing.
        var view = json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200);
        if (view.get("state").get("allPresent").asBoolean()) {
            assertThat(view.get("state").get("status").asText()).isIn("READY", "SUSPENDED");
        } else {
            assertThat(view.get("state").get("status").asText()).isEqualTo("SUSPENDED");
            expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED");
        }
    }

    @Test
    void suspensionRacingADeliveryIsSerialised() throws Exception {
        var t = two();
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        var legal = newUser("LEGAL_VERIFIER");
        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        json(decide(t, legal, requestId, "APPROVE", revision(t)), 200);
        long revision = revision(t);
        var results = race(() -> deliver(t, t.recA(), t.assetA()),
                () -> http("POST", staffBase(t) + "/group-handover/attendance", report(revision, Set.of(t.recB()), "A left"), t.staff().token(), UUID.randomUUID()));
        assertThat(results.stream().map(HttpResponse::statusCode)).doesNotContain(500);
        assertThat(json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200).get("state").get("status").asText())
                .isEqualTo("SUSPENDED");
        int delivered = items(t);
        assertThat(delivered).isBetween(0, 1);
        // Once suspended, nothing else can be delivered; a delivery that committed first is kept, never rolled back.
        expect(deliver(t, t.recB(), t.assetB()), 409, "GROUP_HANDOVER_BLOCKED");
        assertThat(items(t)).isEqualTo(delivered);
    }

    // Rollback when the audit write fails.
    @Test
    void auditFailureRollsBackTheEventAndTheSuspension() throws Exception {
        var t = two();
        var group = context.getBean(GroupHandoverService.class);
        jdbc.execute("CREATE TRIGGER dbo.TR_group_audit_fixture ON dbo.audit_logs AFTER INSERT AS BEGIN "
                + "IF EXISTS(SELECT 1 FROM inserted WHERE action='HANDOVER_GROUP_CHANGED') THROW 51992,'Group audit fixture',1; END");
        try {
            assertThatThrownBy(() -> group.mutate(t.f().publicCaseId(), t.session(), null, UUID.randomUUID(), "ATTENDANCE",
                    new GroupHandoverService.Body(0L, Set.of(t.recA()), "Counter report"), t.f().legal(), false))
                    .isInstanceOf(RuntimeException.class);
        } finally {
            jdbc.execute("DROP TRIGGER dbo.TR_group_audit_fixture");
        }
        assertThat(events(t)).isZero();
        assertThat(revision(t)).isZero();
        assertThat(json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200).get("state").get("status").asText())
                .isEqualTo("UNCONFIRMED");
    }

    // No clock, no job, no change of who benefits; history and receipts are not touched.
    @Test
    void nothingReopensOrChangesByTimeAndHistoryIsPreserved() throws Exception {
        var t = two();
        attendance(t, Set.of(t.recA()));
        long allocations = count("legal_basis_version_allocations", "dossier_version_id IN (SELECT dossier_version_id FROM dbo.legal_basis_dossier_versions "
                + "WHERE legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?))", t.f().caseId());
        jdbc.update("UPDATE dbo.handover_group_events SET created_at=DATEADD(DAY,-90,created_at) WHERE case_id=?", t.f().caseId()); // an old report
        assertThat(json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200).get("state").get("status").asText())
                .isEqualTo("SUSPENDED");
        expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED");
        // Appended events are never updated or deleted by the application.
        assertThat(events(t)).isEqualTo(1);
        assertThat(count("legal_basis_version_allocations", "dossier_version_id IN (SELECT dossier_version_id FROM dbo.legal_basis_dossier_versions "
                + "WHERE legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?))", t.f().caseId()))
                .isEqualTo((int) allocations);
        // The test context removes the scheduler, so assert on the code itself: no group class has a timed method.
        for (Class<?> type : List.of(GroupHandoverService.class, com.legacyvault.verification.group.GroupHandoverController.class)) {
            for (var method : type.getDeclaredMethods()) {
                assertThat(method.isAnnotationPresent(org.springframework.scheduling.annotation.Scheduled.class))
                        .as(type.getSimpleName() + "." + method.getName()).isFalse();
            }
        }
    }

    @FunctionalInterface
    interface Call { HttpResponse<String> run() throws Exception; }

    private static List<HttpResponse<String>> race(Call first, Call second) throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            var a = pool.submit(() -> { start.await(); return first.run(); });
            var b = pool.submit(() -> { start.await(); return second.run(); });
            start.countDown();
            return List.of(a.get(60, TimeUnit.SECONDS), b.get(60, TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
        }
    }}
