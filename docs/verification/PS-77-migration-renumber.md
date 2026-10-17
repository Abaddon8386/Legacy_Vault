> SUPERSEDED for policy/runtime behavior by PS-77-merge-blocker-fix.md and
> docs/api-contracts/open-decisions.md §G. Historical validation below is not group approval.
> Paid self-grants are blocked; proposed Owner quota defaults off; legal intake quota removed.

# PS-77 migration allocation — 2026-10-17

Branch: feature/PS-77-subscription-quota. PR #64 remains open; no PR merge.

The latest remote scan found PS-37 rereview-v2 commit 713eabe newly using V18.
The PS-77 sequence therefore moves again, preserving both original script bytes:

- V19__preserve_lifetime_vault_ownership.sql (formerly V18, originally V12).
- V20__subscription_catalog_and_payload_usage.sql (formerly V19, originally V13).
- V21__lifetime_subscription_catalog.sql: one-time 199000 / 499000 VND, catalog version 2.
- V22__owner_lifetime_entitlements.sql: Owner capacity/price/version snapshots, no expiry.

V12/V13 belong to PS-44/45; V14/V15 to PS-41–43; V16/V17 to court/hold;
V18 is reserved by the active PS-37 revalidation branch. No other fetched remote branch
used V19–V22 except PS-77's previous V19 allocation.

Current develop 75fc18b was merged locally into the feature branch to test the actual
case/legal foundation. No feature PR was merged into develop/main. The earlier 219-test
numbering-only report is superseded by PS-77-lifetime-finalization.md.

Deployment data was not reset or repaired. Environments that already applied any former
PS-77 numbering need a separately reviewed deployment-history plan. This change does not
rewrite flyway_schema_history or change already-applied shared database checksums.
