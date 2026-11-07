# PS-122 — evidence (whole-group handover reads)

Base: develop `5b4c957` (PR #246). Branch `feature/PS-122-group-handover-reads`. Owner: Dương Phạm. Date: 01/11/2026.
Status words: PASS / PARTIAL / FAIL / NOT VERIFIED. "SQL" = real Microsoft SQL Server (disposable `LegacyVault_LegalTest_<uuid>` database, real HTTP + real security chain, no mocks of transactions). "Mock" = Mockito/MockMvc only.

## How it was run

`LEGAL_SQLSERVER_MASTER_URL=…databaseName=master;… ./mvnw test` on a local SQL Server (Windows auth). Result of the whole backend suite: 1190 tests, 8 fail, 83 skipped (skipped = other env-gated classes). The 8 failures (`DmsMinuteSqlServerTest` ×6, `FourPrIntegrationSqlServerTest`, `ProfileAuditSqlServerTest`) fail identically on clean develop `5b4c957` (`ASSET_REQUIRED` in `DmsService.configure`), so they are **pre-existing and unrelated**. All group-handover, handover, legal and received-asset tests pass. `contextLoads` passes on a clean DB.

A mutation check proves the tests can fail: forcing the stale-READY mapping in `GroupHandoverReadService` to keep `READY` makes `readyIsNotShownOnceTheAttendanceNoLongerMatchesTheApprovedScope` fail; source restored.

## PS-122 — AC → test → result

Class `GroupHandoverReadsSqlServerTest` (10 tests, SQL, 11 s) and `GroupHandoverReadControllerTest` (4 tests, Mock).

| AC | Test | Result |
|---|---|---|
| Staff/Legal read case/session, required people, attendance, blocked reason | `detailShowsRequiredPeopleCountsAttendanceRequestAndCapabilitiesInEachPhase` | PASS (SQL) in phases UNCONFIRMED → SUSPENDED(missing) → SUSPENDED(complete) → AWAITING_LEGAL → READY → partly delivered |
| Distinguish complete / requested / approved / delivered | same | PASS (SQL): READY shows `deliveredAssets=0`; delivered counts rise only with real items; denominator stays 2 |
| Capabilities by role and data | same | PASS (SQL): Staff cannot decide, Legal cannot record |
| GET never changes gate, rights or history | `readsNeverChangeTheGateRightsOrHistory` | PASS (SQL) |
| Legal finds pending requests with requester, reason, time, counts, revision | `legalListContainsOnlyCurrentDecidableRequests…` | PASS (SQL) |
| Excludes replaced, decided, changed scope, ended session | same | PASS (SQL) |
| Reassigned Staff, several cases, pages, oldest first | `legalListCoversSeveralCasesPagesAndFollowsAReassignedStaff` | PASS (SQL) |
| 401/403/404/400 | `onlyLegalMayList…`, `historyIsNewestFirstPaged…`, controller test | PASS (SQL + Mock) |
| History after session end/archive | `historyIsNewestFirstPaged…` | PARTIAL: ordering/paging/IDOR PASS; "after archive" covered for the recipient read only |
| Recipient: only own linked cases, zero deliveries included, same event source, own counts | `recipientSeesOnlyOwnCaseWithOwnCountsAndNothingAboutOthersOrInternals` | PASS (SQL): exactly 5 fields; no B name/id, attendance, reason, snapshot, requester in the body |
| READY is not DELIVERED; no false completion | same + stale test | PASS (SQL) |
| Stale READY not shown | `readyIsNotShownOnceTheAttendanceNoLongerMatchesTheApprovedScope` | PASS (SQL), mutation-checked; the read and the delivery gate agree |
| Revoked link loses access at once; other accounts see nothing | `revokedLinkageStopsTheStatusAtOnce…` | PASS (SQL) |
| Content readable only for DELIVERED, also after archive | `archivedCaseKeepsTheRecipientsOwnHistoryReadable` | PARTIAL: status/counts after case CLOSED PASS; content endpoint unchanged and covered by existing `ReceivedAssetSqlServerTest` |
| Read vs mutation concurrency | the read takes the same locks as writes; no dedicated race test for reads | PARTIAL |
| Two-account browser acceptance, FE live adapter | — | NOT VERIFIED (PS-126 / Thái) |

## Known limits

- The Legal list checks each pending case with the decision's own gate and then pages in memory; fine for the natural volume (one pending request per open case), not designed for thousands.
- Scope change is simulated (see PARTIAL above).
- No browser run; FE adapter `loadHandoverStatus` is not connected by this change.
