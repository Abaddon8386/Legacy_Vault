# PS-112 — V41 upgrade verification (2026-10-21)

Base integrated: develop `15a9cc63cb48b15f6abd9650f58457e99dd43e2b`.

## Migration allocation

The unpublished recovery V39 and recovery-hardening V40 are consolidated into `V41__password_recovery.sql`. Official PS-103 `V40__staff_intake_attachments.sql` remains unchanged. PS-112 uses V41 only; V42 is not occupied by this feature.

Suggested coordination: Long's PS-87/PS-106 migrations use V42–V46. This is a proposed allocation, not confirmation from Long; his branch has not been modified or messaged. Recheck develop before either feature merges and renumber the later feature if necessary.

## SQL Server verification

- A simulated installed develop release applies through V40 and seeds an existing user, Staff role, vault, case, will intake and encrypted attachment.
- Negative control introduces recovery as V39 and reproduces `Detected resolved migration not applied to database: 39`.
- Positive control upgrades V40 to V41 with default ordered Flyway validation, then validates and repeats migration as a no-op. V40 checksum, user password/status/roles, attachment ciphertext/metadata and immutable attachment protection remain intact.
- Spring Boot starts against that upgraded populated database; JPA loads the existing user, the secured application serves the public ping endpoint, and the email delivery worker remains absent.
- Failure injection late in V41 verifies transactional rollback of its entire security schema and absence of history version `41`, while develop V40 remains successful. Removing the injected failure permits retry without repair.
- Missing email binding is rejected; PREPARED delivery state is supported directly by V41. Existing concurrency/security tests remain green.

No out-of-order mode, Flyway repair, history relabeling, shared database reset or production migration execution was used. All SQL changes during verification used disposable local fixture databases.

## Results

- Clean targeted SQL Server run: 31 passed, zero failures/errors/skips (upgrade, recovery migration, binding rollback, recovery integration and Staff attachment integration).
- Full backend regression after integrating develop: 870 total, 819 passed, 51 skipped, zero failures/errors. Skipped suites are the existing SubscriptionSqlServerTest (23) and LifetimeImagesSqlServerTest (28) prototypes.
- Subsequent targeted upgrade test, including added actual Spring Boot startup assertions: passed.
- Frontend: 1,078 tests passed; lint and production build passed. Build retains its existing large-chunk warning.
- `git diff --check` passed.

## Operational limits

Private databases that previously applied the unpublished PS-112 V39/recovery-V40 history are a separate conversion case. Do not silently repair, relabel history or reset them; use an isolated fresh fixture or a separately reviewed data-preserving conversion.

Real email remains disabled. No merge into develop, Jira transition, or changes to Long's branch were performed. Handoff documents are excluded from this update.
