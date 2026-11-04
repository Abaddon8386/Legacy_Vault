package com.legacyvault.verification;

import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PS-125 (D1): sending the same Idempotency-Key again for the Legal decision on a reopen request, on real SQL Server and
 * real HTTP. The retry must return the receipt already recorded, never decide twice, never add a second notification and
 * never let a different payload or a different actor reuse the key.
 */
class GroupHandoverLegalReplaySqlServerTest extends GroupHandoverSqlSupport {

    private int events(Two t, String operations) {
        return count("handover_group_events", "case_id=? AND operation IN (" + operations + ")", t.f().caseId());
    }

    private int notifications(Two t, String eventId) {
        return count("workflow_notifications", "case_id=? AND event_key=?", t.f().caseId(), "group:" + eventId);
    }

    /** Same body as {@link GroupHandoverSqlSupport#decide} but the caller chooses the key, so it can be sent twice. */
    private HttpResponse<String> decideWithKey(Two t, User legal, UUID requestId, String decision, long expectedRevision,
            String reason, UUID key) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("expectedRevision", expectedRevision);
        body.put("decision", decision);
        body.put("reason", reason);
        return http("POST", legalBase(t) + "/group-handover/reopen-requests/" + requestId + "/decision", body, legal.token(), key);
    }

    /** A suspended case whose Staff request is waiting for Legal; returns the request id and its revision. */
    private record Pending(UUID requestId, long revision) { }

    private Pending pending(Two t) throws Exception {
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        return new Pending(requestId, revision(t));
    }

    @Test
    void sameKeyAndPayloadReturnsTheRecordedDecisionWithoutDecidingAgain() throws Exception {
        var t = two();
        var pending = pending(t);
        var legal = newUser("LEGAL_VERIFIER");
        UUID key = UUID.randomUUID();

        var first = json(decideWithKey(t, legal, pending.requestId(), "APPROVE", pending.revision(), "Reviewed the counter report", key), 200);
        long revisionAfter = revision(t);
        int eventsAfter = events(t, "'APPROVE','REJECT'");
        var again = json(decideWithKey(t, legal, pending.requestId(), "APPROVE", pending.revision(), "Reviewed the counter report", key), 200);

        assertThat(again.get("eventId").asText()).isEqualTo(first.get("eventId").asText());
        assertThat(again.get("state").toString()).isEqualTo(first.get("state").toString());
        assertThat(again.get("state").get("status").asText()).isEqualTo("READY");
        assertThat(again.get("notification").get("id").asText()).isEqualTo(first.get("notification").get("id").asText());
        assertThat(eventsAfter).isEqualTo(1);
        assertThat(events(t, "'APPROVE','REJECT'")).isEqualTo(1);
        assertThat(revision(t)).isEqualTo(revisionAfter);
        assertThat(notifications(t, first.get("eventId").asText())).isEqualTo(1);
        // A group decision only restores READY for the gate; it never delivers anything.
        assertThat(count("handover_items", "handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)",
                t.sessionId())).isZero();
    }

    @Test
    void sameKeyWithADifferentDecisionOrReasonConflictsAndChangesNothing() throws Exception {
        var t = two();
        var pending = pending(t);
        var legal = newUser("LEGAL_VERIFIER");
        UUID key = UUID.randomUUID();
        var first = json(decideWithKey(t, legal, pending.requestId(), "APPROVE", pending.revision(), "Reviewed the counter report", key), 200);
        long revisionAfter = revision(t);

        expect(decideWithKey(t, legal, pending.requestId(), "REJECT", pending.revision(), "Reviewed the counter report", key), 409, "GROUP_HANDOVER_STALE");
        expect(decideWithKey(t, legal, pending.requestId(), "APPROVE", pending.revision(), "A different reason", key), 409, "GROUP_HANDOVER_STALE");

        assertThat(events(t, "'APPROVE','REJECT'")).isEqualTo(1);
        assertThat(events(t, "'REJECT'")).isZero();
        assertThat(revision(t)).isEqualTo(revisionAfter);
        assertThat(notifications(t, first.get("eventId").asText())).isEqualTo(1);
    }

    @Test
    void anotherLegalUserCannotReplayOrReuseTheKeyToDecideAgain() throws Exception {
        var t = two();
        var pending = pending(t);
        var legal = newUser("LEGAL_VERIFIER");
        var other = newUser("LEGAL_VERIFIER");
        UUID key = UUID.randomUUID();
        var first = json(decideWithKey(t, legal, pending.requestId(), "APPROVE", pending.revision(), "Reviewed the counter report", key), 200);
        long revisionAfter = revision(t);

        // The key belongs to the first actor, so this is a new decision on an already decided request.
        var response = decideWithKey(t, other, pending.requestId(), "APPROVE", pending.revision(), "Reviewed the counter report", key);
        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(events(t, "'APPROVE','REJECT'")).isEqualTo(1);
        assertThat(revision(t)).isEqualTo(revisionAfter);
        assertThat(notifications(t, first.get("eventId").asText())).isEqualTo(1);
    }

    @Test
    void aLateRetryAfterTheStateMovedOnStillReturnsTheOriginalDecisionAndWritesNothing() throws Exception {
        var t = two();
        var pending = pending(t);
        var legal = newUser("LEGAL_VERIFIER");
        UUID key = UUID.randomUUID();
        var first = json(decideWithKey(t, legal, pending.requestId(), "APPROVE", pending.revision(), "Reviewed the counter report", key), 200);

        // Staff then files a newer attendance report: the current revision is no longer the one the decision produced.
        attendance(t, both(t));
        long revisionNow = revision(t);
        int allEvents = events(t, "'ATTENDANCE','REQUEST','APPROVE','REJECT'");
        assertThat(revisionNow).isGreaterThan(first.get("state").get("revision").asLong());

        var late = json(decideWithKey(t, legal, pending.requestId(), "APPROVE", pending.revision(), "Reviewed the counter report", key), 200);

        assertThat(late.get("eventId").asText()).isEqualTo(first.get("eventId").asText());
        assertThat(late.get("state").get("revision").asLong()).isEqualTo(first.get("state").get("revision").asLong());
        assertThat(events(t, "'ATTENDANCE','REQUEST','APPROVE','REJECT'")).isEqualTo(allEvents);
        assertThat(revision(t)).isEqualTo(revisionNow);
        assertThat(notifications(t, first.get("eventId").asText())).isEqualTo(1);
    }

    @Test
    void aReplayStillChecksTheRoleAndNeedsAKey() throws Exception {
        var t = two();
        var pending = pending(t);
        var legal = newUser("LEGAL_VERIFIER");
        UUID key = UUID.randomUUID();
        json(decideWithKey(t, legal, pending.requestId(), "APPROVE", pending.revision(), "Reviewed the counter report", key), 200);

        // Staff cannot use the Legal endpoint even with the original key; no key at all is refused too.
        assertThat(decideWithKey(t, t.staff(), pending.requestId(), "APPROVE", pending.revision(), "Reviewed the counter report", key).statusCode())
                .isEqualTo(403);
        expect(http("POST", legalBase(t) + "/group-handover/reopen-requests/" + pending.requestId() + "/decision",
                Map.of("expectedRevision", pending.revision(), "decision", "APPROVE", "reason", "No key"), legal.token(), null),
                400, "MALFORMED_REQUEST");
        assertThat(events(t, "'APPROVE','REJECT'")).isEqualTo(1);
    }
}
