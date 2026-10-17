# PS-44 patch validation — 2026-10-17

Remote verified: develop `7205d17`, PS-44 `7f81996`, PS-45 `af0ebfa`.
PS-44 merges develop; PS-77 is not an ancestor introduced by this patch.

POST/GET now require an OPEN verification case assigned to the actor for the target Vault.
Writes lock Vault then Case in the existing transaction, compatible with Cancel Alert.
No PS-38/39 contract changes. Audit retains the current adapter and excludes contact note.

Validation with repository Maven wrapper and JDK 25:

- `-Dtest=TrusteeContact*Test test`: 15 passed, 0 failed, 0 skipped, including 6 real SQL Server tests.
- `test`: 236 discovered; 226 passed, 1 error, 9 skipped. BUILD FAILURE, not merge ready.
  `contextLoads` fails on duplicate Flyway V7, not on unavailable SQL Server. SQL Server was reachable.
  Opt-in SQL suites are skipped in the ordinary regression run and run separately as above.
- SQL tests create and drop only `LegacyVault_StaffPatch_<random>` databases.
  They apply the 12 develop migrations with Flyway, then unchanged feature SQL as explicit schema fixtures.
  This does not validate branch-wide Flyway integration or allocate migration numbers.
- SQL tests prove actual Hibernate SQL contains SQL Server `UPDLOCK` on Vault and Case, retained
  through commit; both Cancel Alert orders; audit failure rollback; append-only contacts;
  unauthorized read/write predicates; unique OPEN case enforcement.
- Logs: `backend/target/ps44-final.log`, `backend/target/ps44-regression.log` (local, ignored).

Blockers: team migration allocation (V12/V13 are PS-77; V14+ reserved per review), confirmed
policy for new contacts on REVOKED Trustees, and Staff API to discover target Trustee IDs.
Existing REVOKED behavior is retained behind the new guard pending a decision.
Do not merge until integration blockers are resolved. Merge PS-44 before PS-45.
