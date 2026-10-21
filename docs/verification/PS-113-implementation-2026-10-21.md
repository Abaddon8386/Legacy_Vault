# PS-113 implementation checkpoint

Base: develop `15a9cc6`. Guardian policy approved directly by the user on 2026-10-21; recorded in beneficiary-guardians.md. No Jira fields changed.

Implemented: Owner-scoped guardian read/replace/revoke/history, public UUID DTOs and OpenAPI, contact validation, Vietnam calendar age context/warnings, revision concurrency, shared editable Vault locking, transactional contact history + audit. Beneficiary DOB validation now uses the same calendar zone. No Trustee/auth/invitation/delivery/quota mutation is added.

Targeted SQL Server tests: 3 passed on disposable databases: history/reload/DOB transitions; wrong vault/beneficiary, stale write, audit-failure rollback and archived read/write guard; concurrent same-revision requests produce one winner. Policy/controller tests are run separately; current results are recorded in the final handoff.

AC trace: ownership/API/privacy -> GuardianController/Service; DOB/policy -> BeneficiaryBirthDate, GuardianPolicyTest; persistence/history/race/audit rollback -> GuardianSqlServerTest; frontend handoff -> beneficiary-guardians.md + guardian.openapi.yaml. Huy still owns the UI; browser create-minor/guardian/reload is not certified by these backend tests.

V47 is provisional after PS-112 V41 and proposed PS-87/106 V42–V46. Do not merge/deploy out of order. Recheck the actual develop migrations and renumber this unpublished file before merge if the sequence changes. Existing migrations/checksums are untouched; private test fixtures do not reserve a number globally.

Remaining final review requested by user: integrate latest PS-87/106/109/112 and PS-92/104/114 as they land; migration upgrade/failure injection on the final merged sequence; full backend regression, actual JWT locked/deleted/expired boundary checks and frontend browser acceptance. These are release checks, not claimed complete here. No push/PR/merge/email delivery performed for this task.
