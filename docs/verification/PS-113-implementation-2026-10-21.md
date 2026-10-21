# PS-113 implementation checkpoint

Initial base: develop `15a9cc6`; integrated current develop `f07d69b` after PS-112/#182 and PS-84/#148 merged. Guardian policy approved directly by the user on 2026-10-21; recorded in beneficiary-guardians.md. No Jira fields changed.

Implemented: Owner-scoped guardian read/replace/revoke/history, public UUID DTOs and OpenAPI, contact validation, Vietnam calendar age context/warnings, revision concurrency, shared editable Vault locking, transactional contact history + audit. Beneficiary DOB validation now uses the same calendar zone. No Trustee/auth/invitation/delivery/quota mutation is added.

Targeted SQL Server tests: 3 passed on disposable databases: history/reload/DOB transitions; wrong vault/beneficiary, stale write, audit-failure rollback and archived read/write guard; concurrent same-revision requests produce one winner. Policy/controller tests: 5 passed after fixing the new controller to use native MVC method validation; invalid pagination now returns 400 instead of the earlier AOP validation 500.

AC trace: ownership/API/privacy -> GuardianController/Service; DOB/policy -> BeneficiaryBirthDate, GuardianPolicyTest; persistence/history/race/audit rollback -> GuardianSqlServerTest; frontend handoff -> beneficiary-guardians.md + guardian.openapi.yaml. Huy still owns the UI; browser create-minor/guardian/reload is not certified by these backend tests.

Migration renumbered V47 → V49 (develop already has V48 from PS-114; a lower unapplied V47 would fail Flyway validation). Recheck the actual develop migrations before merge. Existing migrations/checksums are untouched; private test fixtures do not reserve a number globally.

Remaining final review requested by user: integrate latest PS-87/106/109/112 and PS-92/104/114 as they land; migration upgrade/failure injection on the final merged sequence; full backend regression, actual JWT locked/deleted/expired boundary checks and frontend browser acceptance. These are release checks, not claimed complete here. No push/PR/merge into develop/email delivery performed for this task.

Revalidation on develop f07d69b: 48 passed, zero failures/errors/skips (GuardianPolicyTest 3, GuardianControllerTest 2, GuardianSqlServerTest 3, BeneficiaryInvitationSqlServerTest 40). Recovery email explicitly disabled; V41 and V47 both load in disposable fixture databases. This does not certify merge ordering against still-unmerged V42–V46.
