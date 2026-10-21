# PS-99: Legal intake attachment integration

Base: develop `5283c61` (PS-103). Contract: `docs/api-contracts/intake-attachments.md`.

- Legal lists death-document and original-will intake attachments through the corresponding Legal endpoints, then fetches binary content from `/attachments/{attachmentId}/content`.
- Forwarded basis-dossier versions use `/basis-dossier/versions/{versionNo}/content`. Draft versions have no preview action.
- `evidenceReference` remains plain reference text, including values that resemble URLs.
- Content requests carry the current token and language. PDF/JPEG/PNG previews use temporary Blob URLs; closing or changing context aborts requests and revokes URLs. MIME, size and supplied SHA-256 metadata are checked before display. PDF frames are sandboxed; downloading the fetched Blob is also available.
- Access failures and malformed responses remain errors. A 403 clears the workflow data and requires reloading before further actions.
- Admin audit validation accepts the two PS-103 actions `EVIDENCE_FILE_READ` and `INTAKE_ATTACHMENT_UPLOADED`.

Only frontend changes: no Staff upload implementation, backend changes, invented upload limits, or approval/unlock behavior changes.

Validation: 1,078/1,078 frontend tests passed; lint, production build and `git diff --check` passed. Regression coverage includes all three workflow entry points, authenticated content paths, stale requests, Blob cleanup and malformed responses.

Limits: tests use isolated synthetic fixtures and JSDOM. No real backend/SQL integration or browser PDF rendering verification was performed. Production build retains the existing large-chunk warning.
