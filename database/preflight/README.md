# PS-77 read-only preflight

`PS77__owner_vault_storage_readonly.sql` is an explicitly invoked diagnostic, outside
`database/migration`. It must never be registered as a Flyway migration or application startup task.
It uses SELECT/catalog queries, session settings and read-only dynamic SELECTs; it does not create,
update, delete, backfill, decrypt or repair application data/schema.

Run against the intended database using an account with SELECT on the baseline tables and
Flyway history plus metadata visibility (`VIEW DEFINITION`). Prefer an existing read-only account;
this preflight does not create users or change permissions. Windows Authentication example from
the repository root:

```powershell
sqlcmd -S tcp:localhost,1433 -d LegacyVault -E -l 5 -t 30 -b -r 1 -W -s "|" -i database/preflight/PS77__owner_vault_storage_readonly.sql
```

For the same SQL diagnostics followed by a comparison with the **current checkout's** migration
file names (SQL Server Windows Authentication and `sqlcmd` required), use:

```powershell
pwsh -NoProfile -File database/preflight/Invoke-PS77Preflight.ps1 -Server 'tcp:localhost,1433' -Database LegacyVault
```

The wrapper reads local filenames and default Flyway history. It returns exit **2** when a local
version is unapplied, a DB version has no local file, a history entry failed, or a script name differs.
It returns nonzero on query/format errors, and zero only when version/script names match.
Filename matches do **not** validate contents/checksums or authorize running migrations. Stored Flyway
checksums are included in SQL output for review; no `migrate`, `validate` or `repair` is invoked.
Use a fresh shell process as shown because the wrapper uses `exit 2` for detected differences.

`-b` is required so SQL errors produce a nonzero exit code. The script stops on missing baseline,
duplicate Owner/Vault groups or a missing enabled, unfiltered unique key on `vaults.owner_user_id`.
Other findings require review; exit zero means queries completed and those explicit checks passed,
not that PS-77 is ready or all data is valid. A missing role/history, invalid size, orphan or absent
metadata is not equivalent to zero usage. Permissions can hide metadata; investigate visibility
before concluding an object is absent. The history query expects the default `dbo.flyway_schema_history`;
the possible-history inventory helps identify another location that needs a separately reviewed query.

Reports include:

- Owner role presence and aggregate coverage by account status/soft deletion, including Owners
  without Vaults; Vault statuses, duplicate groups, missing users/Owner roles.
- Actual index columns, FK trust/enabled state, Vault trigger inventory and current diagnostic
  principal permissions. Unique Owner does not prove lifetime protection; trigger presence does
  not prove behavior. Application runtime credentials may have different permissions.
- Applied Flyway history, script names/checksums and any existing subscription/payload-size schema.
  Compare history with `git ls-tree -r --name-only origin/develop -- database/migration` and pending
  branches before choosing a new migration version. This is not Flyway checksum validation;
  checksums are reported as stored. Never run migrate/repair as part of this preflight.
- Assets grouped by type/status, encrypted payload byte lengths, and all retained version sizes
  grouped by upload status. Totals are aggregated separately to avoid join multiplication; sums
  use DECIMAL(38,0). Empty groups produce no rows, rather than invented usage.
- Missing/negative payload-size metadata, invalid version sizes and broken storage relationships.
  Ciphertext lengths are diagnostic only: they do not establish plaintext/logical quota usage.

No names, emails, UUIDs, passwords, file names, hashes, keys, plaintext or ciphertext contents are
returned. Do not commit live output; it includes operational metadata and aggregate business data.
Keep any saved report in an access-controlled local location.

Queries run separately at READ COMMITTED without NOLOCK. Concurrent writes can change observations
between result sets. This is not the atomic Owner usage snapshot required by a future quota guard.
COUNT/SUM/DATALENGTH can scan tables/LOBs and take shared locks; run off-peak. Lock waits stop after
5 seconds; the client query timeout is 30 seconds. A timeout is inconclusive, not an empty result.

Policy decisions remain open: DOCUMENT/status count scope, logical payload vs ciphertext/metadata,
legal evidence allocation, byte units, backfill entitlement, periods and grant authority. This
script never compares data to BASIC/paid quotas or chooses those decisions.
