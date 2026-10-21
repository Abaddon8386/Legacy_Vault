# PS-106 invitation mail transport

The current implementation only writes a **QUEUED** record to the transactional outbox. The transport is hard-disabled:
there is no SMTP/provider adapter or worker, and no email is sent. `transportStatus: DISABLED` is not provider acceptance.

The recipient address and raw PS-86 code are serialized only in process memory, encrypted with the existing AES-256-GCM
`EncryptionService`, and persisted together as ciphertext with the invitation public ID as associated data. The outbox
does not expose the plaintext code or address. The bilingual template is
`backend/src/main/resources/mail/beneficiary-invitation-bilingual.txt`; it contains no URL or asset details.

No provider, sender, sandbox recipient, timeout, retry/backoff, resend quota, or ciphertext/key-version retention policy
is configured. Do not enable or build a worker until those settings are approved. V43 adds the outbox table; V41 adds
nullable invitation email binding. Existing V39/V40 attestation migrations and V34 invitation migration are unchanged.

The environment already requires `LEGACYVAULT_ENCRYPTION_KEY` and `LEGACYVAULT_ENCRYPTION_KEY_VERSION`; never commit
their values. SQL Server integration must apply Flyway through V43 before the PS-106 request endpoint can persist rows.
