> SUPERSEDED for policy/runtime behavior by PS-77-merge-blocker-fix.md and
> docs/api-contracts/open-decisions.md §G. Historical validation below is not group approval.
> Paid self-grants are blocked; proposed Owner quota defaults off; legal intake quota removed.

# PS-77 lifetime plans and case evidence — 2026-10-17

## Decisions implemented

The latest Owner decisions supersede the original monthly-period Jira proposal:
BASIC is free after registration; STANDARD costs 199000 VND once; EXTENDED costs
499000 VND once. Every plan is lifetime, with immediate Owner self-upgrade of their
own account, no downgrade, expiry, renewal, scheduled transition or Staff grant.

POST /api/v1/subscriptions/me/upgrade accepts planCode and catalogVersion only.
The principal selects the Owner; server catalog selects price/capacity. Repeating
an unchanged plan is idempotent. An accepted upgrade snapshots capacity, catalog
version and price; catalog updates cannot silently shrink an existing entitlement.
Returned priceDifferenceVnd is catalog arithmetic, not proof of a processed payment.
Payment integration remains outside this backend task.

Legal evidence uses a separate per-case 100 MiB / 50 retained-version / 10 MiB per-file
policy selected under the user's explicit delegation. All historical versions count.
Existing files remain readable by existing legal authorization when quota is full.
New append is blocked; no history is removed. Current file intake is PS-41's basis
versions; other evidence-reference metadata is not file content or Owner storage.

## Transaction and authorization

Owner quota checks and upgrades serialize on the existing User row. Content writers
then lock and refresh Vault state, and payload replacement refreshes/locks Asset size.
A cached ACTIVE Vault or stale payload cannot bypass hold/quota decisions. Account
state/DB roles are reloaded by real Bearer authentication; Staff/Legal cannot self-grant.

Legal intake retains Vault -> Case -> Dossier locking and all Staff ownership, OPEN,
route and hold checks before quota. Two writers cannot both spend the final case byte.
Every entitlement/content/evidence write commits with audit; a real SQL audit failure
rolls back its business changes. There are no independent usage counters to repair.

## Migration allocation

Develop 75fc18b is included locally on the PS-77 feature branch. Latest remote scan
found V18 newly taken by PS-37 rereview-v2 713eabe. PS-77 therefore uses V19–V22:
original lifetime Vault guard, original catalog/computed payload bytes, lifetime-price
catalog conversion, and Owner entitlement snapshots. The original two SQL blobs are
unchanged. Fresh install and V11 upgrade are covered by SQL Server tests.

No real/shared database reset, Flyway repair or history edit. A database that applied
former PS-77 names needs a separately reviewed deployment-history procedure.

## Validation

Final V19–V22 `backend/mvnw.cmd clean test`: **391 passed, 0 failures, 0 errors,
0 skipped**, including 26 PS-77 SQL tests and 4 legal-evidence quota SQL tests. All
opt-in SQL suites (DMS, Staff and legal) were enabled. Fresh contextLoads and a V11
upgrade validated the complete chain. Log: backend/ps77-final-v19-v22.log (ignored).
OpenAPI duplicate-key validation and all 361 local references passed; git diff --check
passed. Original script blob hashes were unchanged after renaming. All SQL suites
use randomly named disposable test databases; runtime
LegacyVault/shared data is not migrated or changed. Byte-boundary fixtures adjust
recorded file-size metadata to avoid allocating a 100 MiB file and are not file-integrity tests.

## Integration status

Backend contract/OpenAPI/error messages are updated. PS-76 still needs review and
browser integration against this contract; no frontend code or browser E2E claim.
PR #64 stays open. No PR merge, production deployment or Jira Done transition.
