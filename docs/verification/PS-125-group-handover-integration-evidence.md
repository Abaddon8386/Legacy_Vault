# PS-125 — evidence (whole-group handover integration tests)

Base: develop `5b4c957` (PR #246). Branch `feature/PS-125-group-handover-integration-tests`. Owner: Dương Phạm. Date: 01/11/2026.
Status words: PASS / PARTIAL / FAIL / NOT VERIFIED. "SQL" = real Microsoft SQL Server (disposable `LegacyVault_LegalTest_<uuid>` database, real HTTP + real security chain, no mocks of transactions). "Mock" = Mockito/MockMvc only.

## How it was run

`LEGAL_SQLSERVER_MASTER_URL=…databaseName=master;… ./mvnw test` on a local SQL Server (Windows auth). Result of the whole backend suite: 1190 tests, 8 fail, 83 skipped (skipped = other env-gated classes). The 8 failures (`DmsMinuteSqlServerTest` ×6, `FourPrIntegrationSqlServerTest`, `ProfileAuditSqlServerTest`) fail identically on clean develop `5b4c957` (`ASSET_REQUIRED` in `DmsService.configure`), so they are **pre-existing and unrelated**. All group-handover, handover, legal and received-asset tests pass. `contextLoads` passes on a clean DB.

A mutation check proves the tests can fail: forcing the stale-READY mapping in `GroupHandoverReadService` to keep `READY` makes `readyIsNotShownOnceTheAttendanceNoLongerMatchesTheApprovedScope` fail; source restored.

## PS-125 — AC → test → result

Classes `GroupHandoverGateSqlServerTest` (3), `GroupHandoverReopenSqlServerTest` (3) and `GroupHandoverConcurrencySqlServerTest` (7): 13 tests, SQL, about 28 s.

| AC (30/10/2026 decision) | Test | Result |
|---|---|---|
| Several recipients, first handover missing one: direct API delivers nothing; Staff report + suspension are one atomic write with audit | `firstHandoverWithoutCompleteAttendanceDeliversNothingByAnyRoute` (no report, then A only) | PASS (SQL): 409 `GROUP_HANDOVER_BLOCKED`, 0 items, 1 event, 1 audit row, vault still `UNLOCKED` |
| Several missing; present person cannot receive alone; UI bypass / old API cannot bypass; no DELIVERED, receipt, close or archive | `presentRecipientNeverReceivesAloneEvenWhenSeveralAreMissing`, same first test for close/receipts/archive | PASS (SQL). Close/receipts/archive asserted as 409 only, not by a specific code |
| Enough people still locked until Staff request + Legal decision | `completeAttendanceStillNeedsStaffRequestAndLegalDecisionByTheRightRoles` | PASS (SQL) |
| Legal cannot open without a request; Staff cannot lift; Admin/Beneficiary cannot replace roles; wrong case/session blocked | same test | PASS (SQL): Legal without request 409, Staff/Admin/Beneficiary decision 403, Legal/Admin cannot write Staff routes 403, wrong session/case 404, revision unchanged |
| Legal opens only on current request and attendance; changed scope, replaced request, decided request, missing person again do not pass | `replacedAttendanceOrChangedScopeInvalidatesThePendingRequest`, `rejectedRequestLeavesTheWholeCaseSuspended`, `attendanceChangeRacingALegalDecision…` | PARTIAL (SQL). Scope change is simulated by changing the dossier's `updated_at` (part of the fingerprint); a real new document version / allocation change through the full Legal flow was not re-run here |
| Decision does not deliver or lift other legal guards | approval test | PASS (SQL): 0 items, vault still `UNLOCKED` after APPROVE |
| Retry/idempotency | `retryWithTheSameKeyReturnsTheOriginalReceiptAndOnePayloadChangeConflicts`, `staleExpectedRevisionAndMissingRequestOrReasonAreRejected` | PASS (SQL) |
| Two Staff requests; two Legal decisions | `twoStaffRequestsAtOnce…`, `twoLegalDecisionsAtOnce…` | PASS (SQL): exactly one 200 and one 409, one event |
| Attendance change vs decision | `attendanceChangeRacingALegalDecision…` | PASS (SQL) as an invariant on the final gate; the order that won is not fixed |
| Suspension vs delivery | `suspensionRacingADeliveryIsSerialised` | PASS (SQL): no 500, final state `SUSPENDED`, committed delivery kept, nothing delivered after |
| Rollback when audit fails | `auditFailureRollsBackTheEventAndTheSuspension` (trigger on `audit_logs`) | PASS (SQL): 0 events, revision 0, state `UNCONFIRMED` |
| Rollback when file/storage fails | — | NOT VERIFIED (no storage write in this flow was failed) |
| No job opens/locks by time; no change of beneficiaries | `nothingReopensOrChangesByTimeAndHistoryIsPreserved` | PASS (SQL + reflection: no `@Scheduled` in group classes; test context removes the scheduler, so the check is on the code) |
| Preserve data/receipts/history | same + delivery tests | PASS (SQL) for events, allocations, items; encryption of asset content NOT VERIFIED here (untouched code) |
| No leak across account/role/case | Privacy tests live in the PS-122 branch (`GroupHandoverReadsSqlServerTest`) | NOT VERIFIED on this branch alone; PASS on the PS-122 branch |


## Update 04/11/2026 (D1) — all group handover SQL classes on develop `c923490` + this branch

Command: `LEGAL_SQLSERVER_MASTER_URL=…databaseName=master;… ./mvnw test "-Dtest=GroupHandover*SqlServerTest"` on a local SQL Server, run in the branch `test/PS-125-legal-decision-replay` at commit `6bafe48`. Result (Maven summary, 04/11/2026 13:10 +07:00): **Tests run: 39, Failures: 0, Errors: 0, Skipped: 0, BUILD SUCCESS**, 1 min 06 s.

The 39 tests are the classes `GroupHandoverReadsSqlServerTest` (10, PS-122), `GroupHandoverGateSqlServerTest` (3), `GroupHandoverReopenSqlServerTest` (3), `GroupHandoverConcurrencySqlServerTest` (7), `GroupHandoverLegalReplaySqlServerTest` (5, new), `GroupHandoverRaceSqlServerTest` (8, PS-121) and `GroupHandoverSqlServerTest` (3, PS-120). `Skipped: 0` shows the SQL connection was used; without `LEGAL_SQLSERVER_MASTER_URL` the same command errors with `The url cannot be null`.

New tests (`GroupHandoverLegalReplaySqlServerTest`, real HTTP):

| AC | Test | Result |
|---|---|---|
| Same Idempotency-Key and same payload for the Legal decision returns the recorded receipt; no second decision or notification; nothing delivered | `sameKeyAndPayloadReturnsTheRecordedDecisionWithoutDecidingAgain` | PASS (SQL) |
| Same key with another decision or reason is refused (409 `GROUP_HANDOVER_STALE`), nothing written | `sameKeyWithADifferentDecisionOrReasonConflictsAndChangesNothing` | PASS (SQL) |
| Another Legal user cannot reuse the first user's key to decide again | `anotherLegalUserCannotReplayOrReuseTheKeyToDecideAgain` | PASS (SQL) |
| A late retry after Staff filed a newer report returns the original decision and writes nothing | `aLateRetryAfterTheStateMovedOnStillReturnsTheOriginalDecisionAndWritesNothing` | PASS (SQL) |
| Replay still checks the role; a missing key is a client error | `aReplayStillChecksTheRoleAndNeedsAKey` | PASS (SQL) after the fix below |

Defect found by the first run: a missing `Idempotency-Key` header returned **500** (`MissingRequestHeaderException` was not mapped), on all three group POSTs. Fixed in commit `d00552f` by mapping it to 400 `MALFORMED_REQUEST` in `GlobalExceptionHandler`; `GroupHandoverControllerTest.missingOrMalformedIdempotencyKeyIsABadRequestNotAServerError` fails with 500 without the fix and passes with it. The first SQL run before the fix: 4 of 5 passed, `aReplayStillChecksTheRoleAndNeedsAKey` failed (500).

Rows that changed from this file's earlier status:

- Privacy across account/role/case: PASS (SQL) in `GroupHandoverReadsSqlServerTest`, now part of the same 39-test run (PS-122 is on develop).

Still NOT VERIFIED: failing a storage write inside the flow, a dedicated race test for the read endpoints, and the browser two-account acceptance (PS-126).
