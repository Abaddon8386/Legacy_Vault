# PS-77 merge blocker correction — 2026-10-17

## Final behavior

- Concrete LegalEvidenceQuotaSqlServerTest has its own EnabledIfEnvironmentVariable condition.
  No LEGAL_SQLSERVER_MASTER_URL means skip before startDatabase; no null JDBC URL.
- Upgrade service unconditionally rejects valid requests with 409 SUBSCRIPTION_UPGRADE_UNAVAILABLE.
  It has no repository/audit dependency, no grant write path and no configuration bypass.
  Previous self-granted entitlement rows are not read as proof of payment or authorization.
- Proposed Owner quota defaults off. Catalog/current APIs fail closed with
  SUBSCRIPTION_POLICY_PENDING; normal Owner content writes do not enforce proposed capacities.
  Existing payload/upload sizes and authorization/Vault state checks still apply.
- Removed subscription evidence service and its integration into BasisIntakeService completely.
  PS-41 retains its approved intake behavior, including more than 100 MiB aggregate or 50 versions.
- open-decisions.md section G records exact proposals, PENDING group approval, source limitations,
  required payment/confirmation decisions and acceptance criteria. No approval is fabricated.
  Historical notes are marked superseded; current contract/OpenAPI and vi/en errors are corrected.

## Scope and migration safety

One Vault/Owner remains supported by the existing A4 approval. V19–V22 migrations are unchanged;
prototype catalog values do not activate policy or grant entitlements. No DB reset/repair/history edit.
No frontend/payment implementation, external group approval claim, Jira Done or PR merge.
No CLAUDE.md was found in the checkout or ancestor directories; the review's stated written-approval
requirement is honored by recording pending proposals and disabling their business effects.

## Verification

No-DB run: mvnw -Dtest=LegalEvidenceQuotaSqlServerTest test — 2 skipped, 0 failures/errors,
BUILD SUCCESS; no connection attempted. Logs are ignored local artifacts.
Full SQL-enabled clean regression: **385 passed, 0 failures/errors/skips**, including
22 PS-77 SQL tests and both legal intake regressions. Log: ps77-merge-blocker-full.log.
After adding default-disabled and legacy-entitlement regressions, focused suite:
**24 passed, 0 failures/errors/skips** (23 PS-77 SQL + 1 default-policy unit test).
Log: ps77-pending-policy-focused.log. These counts overlap; they are not additive.
Positive tests for the removed unapproved grant/evidence-cap behavior were replaced
by fail-closed and legal-intake preservation regressions.
OpenAPI: valid YAML, no duplicate keys, all 362 local references resolve.
git diff --check passed. All SQL tests used disposable databases, removed after the runs;
existing LegacyVault/shared databases were untouched.
