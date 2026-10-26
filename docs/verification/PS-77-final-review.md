# PR 64 final review with PS-37 — 2026-10-17

## Reviewed snapshots

- PR 64 head before this follow-up: 0d89ada; develop: 75fc18b.
- Latest fetched PS-37: feature/PS-37-legal-basis-rereview-v2, b34cda0.
- Reviewed all PR production changes, migrations, quota/auth/locking/audit paths,
  test gating, API/policy contracts, diagnostics and intersections with PS-37.
- GitHub inline comments/reviews were empty; the sole issue comment was `reopen`.

## Findings corrected

1. ApiError.code in OpenAPI omitted runtime errors, including the two new pending-policy/
   unavailable-upgrade codes. It now represents every ErrorCode. A real YAML-based JUnit
   regression checks exact enum parity, duplicate keys and every local reference.
2. Asset/Will contracts still described quota as unconditional. They now explicitly say
   default OFF, prototype only, pending the group decision in open-decisions.md section G.
3. Synthetic integration with PS-37 originally conflicted in Vault.java and OpenAPI.
   Removed the unnecessary change to the pre-existing JPA constraint annotation name;
   the real Flyway SQL unique constraint and immutable Owner mapping remain intact.
   Moved subscription schemas away from PS-37's insertion point and arranged error enum
   additions without overwriting either branch. Synthetic integration is now conflict-free.
   No PS-37 service/controller/review-state implementation is copied into PR 64.
4. Renamed requireApprovedPolicy to requirePrototypeEnabled: a feature flag is not
   proof of group approval. Runtime behavior and default-disabled setting are unchanged.
5. Read-only preflight inventory now recognizes the actual subscription_plans and
   owner_subscription_entitlements names as well as historical/proposed names.

## Verification

- Final PR 64 clean Maven regression, all SQL opt-ins enabled: **388 passed,
  0 failures, 0 errors, 0 skipped**. Log: backend/ps77-final-review-full.log (ignored).
- Synthetic PS-77 + PS-37 clean Maven regression: **415 passed, 0 failures,
  0 errors, 0 skipped**, including 14 LegalBasisReviewService tests, 23 PS-77 SQL
  tests and both PS-41 quota-independence SQL tests. Log: backend/ps77-ps37-compat.log.
- Synthetic temporary tree 373960c contains staged review fixes plus PS-37 b34cda0;
  it was built in an isolated detached checkout. Neither source branch was merged
  into the other. The temporary checkout was removed after verification.
- Combined Flyway applies PS-37 V18 and PS-77 V19–V22 on real SQL Server; fresh
  contextLoads and V11 upgrade both pass. No V19–V22 collision on other fetched refs.
- No-DB targeted run: 2 ordinary tests passed; both concrete legal SQL tests skipped
  before DB startup. Zero failures/errors. Log: backend/ps77-final-review-no-db.log.
- OpenAPI duplicate-key, local-reference and full runtime-error parity checks passed
  on both the standalone PR and combined tree. git diff --check passed.
- All SQL suites use disposable random databases, removed after runs. No existing
  LegacyVault/shared DB migration, reset, repair or history edit. Migration blobs unchanged.

## Decisions still pending — not approval by testing

Group approval is still missing for lifetime pricing, capacities, count/storage units
and scope, legal evidence caps, and payment/authorized-confirmation workflow. The exact
proposals and approval criteria remain in open-decisions.md section G. Chat preferences,
prototype seed rows and passing tests do not establish approval or payment confirmation.

Paid self-upgrade still always returns SUBSCRIPTION_UPGRADE_UNAVAILABLE. No entitlement
write path or trusted legacy self-grant exists. Proposed Owner quota defaults off;
subscription catalog/current return SUBSCRIPTION_POLICY_PENDING by default. PS-41 has
no subscription evidence byte/version cap; its normal upload/auth/state/hold guards remain.
One Vault/Owner continues under the existing A4 decision.

No additional technical integration blocker was found at the reviewed snapshots.
This is not a declaration that full paid PS-77 or PS-37 business policy is approved.
Activation/payment/FE integration needs a separately reviewed implementation and group
sign-off. GitHub required reviews/checks still apply. PR 64 stays open, not merged.
