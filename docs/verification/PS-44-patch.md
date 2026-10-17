# PS-44 patch validation — 2026-10-17

Remote verified: develop `7205d17`, PS-44 `7f81996`, PS-45 `af0ebfa`.
PS-44 merges develop; PS-77 is not an ancestor introduced by this patch.

POST/GET now require an OPEN verification case assigned to the actor for the target Vault.
Writes lock Vault then Case in the existing transaction, compatible with Cancel Alert.
The user confirmed that REVOKED Trustees cannot receive new contacts. After authorization,
writes refresh and lock the Trustee; REVOKED returns 409 TRUSTEE_REVOKED without history/audit writes.
Existing history stays readable under the OPEN/assigned case guard; inaccessible targets still return 404.
No PS-38/39 contract changes. Audit retains the current adapter and excludes contact note.

Validation with repository Maven wrapper and JDK 25:

- `-Dtest=TrusteeContact*Test test`: 19 passed, 0 failed, 0 skipped, including 8 real SQL Server tests.
- `test`: 240 discovered; 228 passed, 1 error, 11 skipped. BUILD FAILURE, not merge ready.
  `contextLoads` fails on duplicate Flyway V7, not on unavailable SQL Server. SQL Server was reachable.
  Opt-in SQL suites are skipped in the ordinary regression run and run separately as above.
- SQL tests create and drop only `LegacyVault_StaffPatch_<random>` databases.
  They apply the 12 develop migrations with Flyway, then unchanged feature SQL as explicit schema fixtures.
  This does not validate branch-wide Flyway integration or allocate migration numbers.
- SQL tests prove actual Hibernate SQL contains SQL Server `UPDLOCK` on Vault and Case, retained
  through commit; both Cancel Alert orders; audit failure rollback; append-only contacts;
  unauthorized read/write predicates; unique OPEN case enforcement; REVOKED rejection with preserved
  history; and a stale APPOINTED entity loaded before a concurrent revocation is refreshed and rejected.
- Logs: `backend/target/ps44-policy-focused-final.log`, `backend/target/ps44-policy-regression.log` (local, ignored).

Blockers: the team confirmed no migration numbers have been allocated to PS-44/45 on develop
(V12/V13 are PS-77; V14+ reserved per review), and Staff API to discover target Trustee IDs.
Do not merge until integration blockers are resolved. Merge PS-44 before PS-45.
