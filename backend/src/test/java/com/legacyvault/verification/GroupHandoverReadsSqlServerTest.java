package com.legacyvault.verification;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.UUID;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PS-122: the read side of the whole-group handover on real SQL Server and the real HTTP stack: Staff/Legal detail,
 * the Legal list of pending reopen requests, the event history and the private recipient status (PS-124 blocker).
 */
class GroupHandoverReadsSqlServerTest extends GroupHandoverSqlSupport {

    private static final String LIST = "/legal-verifications/group-handover/reopen-requests";

    private String caseNumber(Two t) {
        return jdbc.queryForObject("SELECT 'HS-' + FORMAT(YEAR(created_at),'0000') + '-' + FORMAT(verification_case_id,'000000') "
                + "FROM dbo.verification_cases WHERE verification_case_id=?", String.class, t.f().caseId());
    }

    private JsonNode pending(User legal, Two t) throws Exception {
        return json(http("GET", LIST + "?caseId=" + t.f().publicCaseId(), null, legal.token(), null), 200);
    }

    private int eventCount(Two t) { return count("handover_group_events", "case_id=?", t.f().caseId()); }

    // ---- Staff and Legal detail ----------------------------------------------------------------------------------

    @Test
    void detailShowsRequiredPeopleCountsAttendanceRequestAndCapabilitiesInEachPhase() throws Exception {
        var t = two();
        var legal = newUser("LEGAL_VERIFIER");

        var fresh = json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200);
        assertThat(fresh.get("state").get("status").asText()).isEqualTo("UNCONFIRMED");
        assertThat(fresh.get("caseNumber").asText()).isEqualTo(caseNumber(t));
        assertThat(fresh.get("sessionStatus").asText()).isEqualTo("OPEN");
        assertThat(fresh.get("progress").get("requiredRecipients").asInt()).isEqualTo(2);
        assertThat(fresh.get("progress").get("totalAssets").asInt()).isEqualTo(2);
        assertThat(fresh.get("progress").get("deliveredAssets").asInt()).isZero();
        assertThat(fresh.get("attendance").isNull()).isTrue();
        assertThat(fresh.get("capabilities").get("canRecordAttendance").asBoolean()).isTrue();
        assertThat(fresh.get("capabilities").get("canRequestReopen").asBoolean()).isFalse();
        assertThat(fresh.get("capabilities").get("deliveryBlockedReason").asText()).isEqualTo("ATTENDANCE_REQUIRED");

        attendance(t, Set.of(t.recA()));
        var missing = json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200);
        assertThat(missing.get("state").get("status").asText()).isEqualTo("SUSPENDED");
        assertThat(missing.get("progress").get("presentRecipients").asInt()).isEqualTo(1);
        assertThat(missing.get("attendance").get("presentRecipientIds")).hasSize(1);
        assertThat(missing.get("attendance").get("recordedBy").get("fullName").asText()).isNotBlank();
        assertThat(missing.get("capabilities").get("canRequestReopen").asBoolean()).isFalse();
        assertThat(missing.get("capabilities").get("deliveryBlockedReason").asText()).isEqualTo("MISSING_RECIPIENTS");

        attendance(t, both(t));
        var complete = json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200);
        assertThat(complete.get("state").get("status").asText()).isEqualTo("SUSPENDED"); // enough people is not a reopening
        assertThat(complete.get("capabilities").get("canRequestReopen").asBoolean()).isTrue();
        assertThat(complete.get("capabilities").get("deliveryBlockedReason").asText()).isEqualTo("LEGAL_REOPEN_REQUIRED");

        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        var staffView = json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200);
        assertThat(staffView.get("state").get("status").asText()).isEqualTo("AWAITING_LEGAL");
        assertThat(staffView.get("request").get("requestId").asText()).isEqualTo(requestId.toString());
        assertThat(staffView.get("request").get("reason").asText()).isEqualTo("Everyone is now present");
        assertThat(staffView.get("capabilities").get("canDecide").asBoolean()).isFalse();           // Staff cannot lift it
        var legalView = json(http("GET", legalBase(t) + "/group-handover", null, legal.token(), null), 200);
        assertThat(legalView.get("capabilities").get("canDecide").asBoolean()).isTrue();
        assertThat(legalView.get("capabilities").get("canRecordAttendance").asBoolean()).isFalse();
        assertThat(legalView.get("request").get("requestedBy").get("fullName").asText()).isNotBlank();

        json(decide(t, legal, requestId, "APPROVE", legalView.get("state").get("revision").asLong()), 200);
        var ready = json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200);
        assertThat(ready.get("state").get("status").asText()).isEqualTo("READY");
        assertThat(ready.get("deliveryAllowed").asBoolean()).isTrue();
        assertThat(ready.get("request").isNull()).isTrue();
        assertThat(ready.get("lastDecision").get("result").asText()).isEqualTo("APPROVE");
        assertThat(ready.get("progress").get("deliveredAssets").asInt()).isZero(); // READY is not DELIVERED

        json(deliver(t, t.recA(), t.assetA()), 201);
        var partly = json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200);
        assertThat(partly.get("progress").get("deliveredAssets").asInt()).isEqualTo(1);
        assertThat(partly.get("progress").get("totalAssets").asInt()).isEqualTo(2); // the denominator never shrinks
    }

    @Test
    void readsNeverChangeTheGateRightsOrHistory() throws Exception {
        var t = two();
        var legal = newUser("LEGAL_VERIFIER");
        attendance(t, Set.of(t.recA()));
        int before = eventCount(t);
        long revision = revision(t);
        for (int i = 0; i < 3; i++) {
            json(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200);
            json(http("GET", legalBase(t) + "/group-handover", null, legal.token(), null), 200);
            json(http("GET", LIST, null, legal.token(), null), 200);
            json(http("GET", staffBase(t) + "/group-handover/events", null, t.staff().token(), null), 200);
        }
        assertThat(eventCount(t)).isEqualTo(before);
        assertThat(revision(t)).isEqualTo(revision);
        assertThat(count("handover_items", "handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)", t.sessionId())).isZero();
        expect(http("GET", staffBase(t) + "/group-handover", null, t.staff().token(), null), 200, null);
    }

    // ---- Legal list of pending requests -----------------------------------------------------------------------------

    @Test
    void legalListContainsOnlyCurrentDecidableRequestsAndDropsEveryObsoleteOne() throws Exception {
        var t = two();
        var legal = newUser("LEGAL_VERIFIER");
        assertThat(pending(legal, t).get("content")).isEmpty();                   // nothing asked yet

        attendance(t, Set.of(t.recA()));
        assertThat(pending(legal, t).get("content")).isEmpty();                   // suspended is not a request
        attendance(t, both(t));
        assertThat(pending(legal, t).get("content")).isEmpty();                   // enough people is not a request either

        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        var listed = pending(legal, t);
        assertThat(listed.get("totalElements").asInt()).isEqualTo(1);
        var item = listed.get("content").get(0);
        assertThat(item.get("requestId").asText()).isEqualTo(requestId.toString());
        assertThat(item.get("caseId").asText()).isEqualTo(t.caseId());
        assertThat(item.get("sessionId").asText()).isEqualTo(t.sessionId());
        assertThat(item.get("caseNumber").asText()).isEqualTo(caseNumber(t));
        assertThat(item.get("reason").asText()).isEqualTo("Everyone is now present");
        assertThat(item.get("requestedBy").get("fullName").asText()).isNotBlank();
        assertThat(item.get("requestedAt").asText()).isNotBlank();
        assertThat(item.get("requiredRecipients").asInt()).isEqualTo(2);
        assertThat(item.get("presentRecipients").asInt()).isEqualTo(2);
        assertThat(item.get("allPresent").asBoolean()).isTrue();
        assertThat(item.get("decidable").asBoolean()).isTrue();
        assertThat(item.has("snapshot")).isFalse();                                // no hashes or internal ids in the list

        // Filters.
        assertThat(json(http("GET", LIST + "?caseNumber=" + caseNumber(t).toLowerCase(), null, legal.token(), null), 200).get("content")).hasSize(1);
        assertThat(json(http("GET", LIST + "?caseNumber=HS-2000-000001", null, legal.token(), null), 200).get("content")).isEmpty();
        expect(http("GET", LIST + "?caseNumber=garbage", null, legal.token(), null), 400, "VALIDATION_FAILED");
        expect(http("GET", LIST + "?size=0", null, legal.token(), null), 400, "VALIDATION_FAILED");
        expect(http("GET", LIST + "?page=-1", null, legal.token(), null), 400, "VALIDATION_FAILED");

        // A newer report replaces the request: the old one disappears, history stays.
        attendance(t, both(t));
        assertThat(pending(legal, t).get("content")).isEmpty();
        UUID second = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        assertThat(pending(legal, t).get("content").get(0).get("requestId").asText()).isEqualTo(second.toString());

        // The approved scope changes: no longer decidable, so not listed.
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET updated_at=DATEADD(SECOND,5,updated_at) WHERE verification_case_id=?", t.f().caseId());
        assertThat(pending(legal, t).get("content")).isEmpty();
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET updated_at=DATEADD(SECOND,-5,updated_at) WHERE verification_case_id=?", t.f().caseId());
        assertThat(pending(legal, t).get("content")).hasSize(1);

        // The session ends: no longer decidable.
        jdbc.update("UPDATE dbo.handover_sessions SET status='CANCELLED' WHERE public_id=?", t.sessionId());
        assertThat(pending(legal, t).get("content")).isEmpty();
        jdbc.update("UPDATE dbo.handover_sessions SET status='OPEN' WHERE public_id=?", t.sessionId());

        // Decided requests leave the list.
        json(decide(t, legal, second, "APPROVE", revision(t)), 200);
        assertThat(pending(legal, t).get("content")).isEmpty();
    }

    @Test
    void legalListCoversSeveralCasesPagesAndFollowsAReassignedStaff() throws Exception {
        var first = two();
        var second = two();
        var legal = newUser("LEGAL_VERIFIER");
        for (var t : new Two[] {first, second}) {
            attendance(t, Set.of(t.recA()));
            attendance(t, both(t));
            reopenRequest(t);
        }
        var all = json(http("GET", LIST + "?size=1", null, legal.token(), null), 200);
        assertThat(all.get("totalElements").asInt()).isGreaterThanOrEqualTo(2);
        assertThat(all.get("content")).hasSize(1);
        assertThat(all.get("totalPages").asInt()).isGreaterThanOrEqualTo(2);
        var everything = json(http("GET", LIST + "?size=100", null, legal.token(), null), 200).get("content");
        assertThat(StreamSupport.stream(everything.spliterator(), false).map(n -> n.get("caseId").asText()))
                .contains(first.caseId(), second.caseId());
        // Oldest first.
        assertThat(everything.get(0).get("requestedAt").asText().compareTo(everything.get(everything.size() - 1).get("requestedAt").asText())).isLessThanOrEqualTo(0);

        // A request made by a Staff who is no longer assigned is no longer current.
        var other = newUser("STAFF_EXECUTOR");
        jdbc.update("UPDATE dbo.verification_cases SET assigned_staff_user_id=? WHERE verification_case_id=?", other.userId(), first.f().caseId());
        assertThat(pending(legal, first).get("content")).isEmpty();
        assertThat(pending(legal, second).get("content")).hasSize(1);
    }

    @Test
    void onlyLegalMayListAndStaffAdminBeneficiaryAndAnonymousAreRefused() throws Exception {
        var t = two();
        expect(http("GET", LIST, null, t.staff().token(), null), 403, null);
        expect(http("GET", LIST, null, newUser("ADMIN").token(), null), 403, null);
        expect(http("GET", LIST, null, beneficiaryUser(t.benA()).token(), null), 403, null);
        expect(http("GET", LIST, null, null, null), 401, null);
    }

    // ---- History ----------------------------------------------------------------------------------------------------

    @Test
    void historyIsNewestFirstPagedAndScopedToTheCaseOwnerOrLegal() throws Exception {
        var t = two();
        var legal = newUser("LEGAL_VERIFIER");
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        json(decide(t, legal, requestId, "REJECT", revision(t)), 200);

        var page = json(http("GET", staffBase(t) + "/group-handover/events?size=2", null, t.staff().token(), null), 200);
        assertThat(page.get("totalElements").asInt()).isEqualTo(4);
        assertThat(page.get("totalPages").asInt()).isEqualTo(2);
        assertThat(page.get("content").get(0).get("operation").asText()).isEqualTo("REJECT");
        assertThat(page.get("content").get(1).get("operation").asText()).isEqualTo("REQUEST");
        var rest = json(http("GET", staffBase(t) + "/group-handover/events?size=2&page=1", null, t.staff().token(), null), 200);
        assertThat(rest.get("content").get(1).get("operation").asText()).isEqualTo("ATTENDANCE");
        assertThat(rest.get("content").get(1).get("resultingStatus").asText()).isEqualTo("SUSPENDED");
        assertThat(json(http("GET", legalBase(t) + "/group-handover/events", null, legal.token(), null), 200).get("totalElements").asInt()).isEqualTo(4);

        // Another Staff, the wrong session, a beneficiary and bad paging cannot read it.
        var stranger = newUser("STAFF_EXECUTOR");
        expect(http("GET", staffBase(t) + "/group-handover/events", null, stranger.token(), null), 404, null);
        expect(http("GET", "/staff/verification-cases/" + t.caseId() + "/handover-sessions/" + UUID.randomUUID() + "/group-handover/events",
                null, t.staff().token(), null), 404, null);
        expect(http("GET", staffBase(t) + "/group-handover/events", null, beneficiaryUser(t.benA()).token(), null), 403, null);
        expect(http("GET", staffBase(t) + "/group-handover/events?size=101", null, t.staff().token(), null), 400, "VALIDATION_FAILED");
    }

    // ---- Private recipient status (PS-124) ----------------------------------------------------------------------------

    @Test
    void recipientSeesOnlyOwnCaseWithOwnCountsAndNothingAboutOthersOrInternals() throws Exception {
        var t = two();
        var legal = newUser("LEGAL_VERIFIER");
        var a = beneficiaryUser(t.benA());
        var b = beneficiaryUser(t.benB());

        // Linked but nothing delivered and no report yet: still listed, with the full denominator.
        var start = json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200);
        assertThat(start.get("subjectId").asText()).isEqualTo(a.publicId().toString());
        assertThat(start.get("cases")).hasSize(1);
        var own = start.get("cases").get(0);
        assertThat(own.get("caseId").asText()).isEqualTo(t.caseId());
        assertThat(own.get("caseNumber").asText()).isEqualTo(caseNumber(t));
        assertThat(own.get("status").asText()).isEqualTo("UNCONFIRMED");
        assertThat(own.get("totalAssets").asInt()).isEqualTo(1);
        assertThat(own.get("deliveredAssets").asInt()).isZero();
        assertThat(own.size()).isEqualTo(5); // exactly the five contract fields

        attendance(t, Set.of(t.recA()));
        var suspended = json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200).get("cases").get(0);
        assertThat(suspended.get("status").asText()).isEqualTo("SUSPENDED");
        String body = http("GET", "/beneficiary-handover-status", null, a.token(), null).body();
        for (String leak : new String[] {"Recipient B", t.recB().toString(), "presentRecipient", "attendance", "reason", "snapshot", "requestedBy", "Counter report"})
            assertThat(body).doesNotContain(leak);

        attendance(t, both(t));
        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        assertThat(json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200).get("cases").get(0).get("status").asText())
                .isEqualTo("AWAITING_LEGAL");
        json(decide(t, legal, requestId, "APPROVE", revision(t)), 200);
        var ready = json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200).get("cases").get(0);
        assertThat(ready.get("status").asText()).isEqualTo("READY");
        assertThat(ready.get("deliveredAssets").asInt()).isZero();        // READY is not DELIVERED

        json(deliver(t, t.recA(), t.assetA()), 201);
        var delivered = json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200).get("cases").get(0);
        assertThat(delivered.get("deliveredAssets").asInt()).isEqualTo(1);
        assertThat(delivered.get("totalAssets").asInt()).isEqualTo(1);
        // B has its own counts: A's delivery is not B's.
        var others = json(http("GET", "/beneficiary-handover-status", null, b.token(), null), 200).get("cases").get(0);
        assertThat(others.get("deliveredAssets").asInt()).isZero();
        assertThat(others.get("totalAssets").asInt()).isEqualTo(1);
        assertThat(others.get("status").asText()).isEqualTo("READY");
    }

    @Test
    void readyIsNotShownOnceTheAttendanceNoLongerMatchesTheApprovedScope() throws Exception {
        var t = two();
        var legal = newUser("LEGAL_VERIFIER");
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        json(decide(t, legal, requestId, "APPROVE", revision(t)), 200);
        var a = beneficiaryUser(t.benA());
        assertThat(json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200).get("cases").get(0).get("status").asText()).isEqualTo("READY");
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET updated_at=DATEADD(SECOND,5,updated_at) WHERE verification_case_id=?", t.f().caseId());
        assertThat(json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200).get("cases").get(0).get("status").asText()).isEqualTo("UNCONFIRMED");
        expect(deliver(t, t.recA(), t.assetA()), 409, "GROUP_HANDOVER_BLOCKED"); // the read and the gate agree
    }

    @Test
    void revokedLinkageStopsTheStatusAtOnceAndOtherAccountsGetNothing() throws Exception {
        var t = two();
        var a = beneficiaryUser(t.benA());
        assertThat(json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200).get("cases")).hasSize(1);
        jdbc.update("UPDATE dbo.beneficiaries SET linked_user_id=NULL, account_status='NOT_CREATED' WHERE beneficiary_id=?", t.benA());
        assertThat(json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200).get("cases")).isEmpty();

        // An unrelated recipient account, a Staff and an anonymous caller cannot read anything of this case.
        var unrelated = newUser("BENEFICIARY");
        assertThat(json(http("GET", "/beneficiary-handover-status", null, unrelated.token(), null), 200).get("cases")).isEmpty();
        expect(http("GET", "/beneficiary-handover-status", null, t.staff().token(), null), 403, null);
        expect(http("GET", "/beneficiary-handover-status", null, null, null), 401, null);
    }

    @Test
    void archivedCaseKeepsTheRecipientsOwnHistoryReadable() throws Exception {
        var t = two();
        var legal = newUser("LEGAL_VERIFIER");
        attendance(t, Set.of(t.recA()));
        attendance(t, both(t));
        UUID requestId = UUID.fromString(reopenRequest(t).get("state").get("requestId").asText());
        json(decide(t, legal, requestId, "APPROVE", revision(t)), 200);
        json(deliver(t, t.recA(), t.assetA()), 201);
        var a = beneficiaryUser(t.benA());
        // Simulate the end of the case: closed case, archived vault. The status must not disappear or claim more.
        jdbc.update("UPDATE dbo.verification_cases SET status='CLOSED' WHERE verification_case_id=?", t.f().caseId());
        var kept = json(http("GET", "/beneficiary-handover-status", null, a.token(), null), 200).get("cases");
        assertThat(kept).hasSize(1);
        assertThat(kept.get(0).get("deliveredAssets").asInt()).isEqualTo(1);
        assertThat(kept.get(0).get("totalAssets").asInt()).isEqualTo(1);
    }
}
