# Auth roles — FE compatibility (PS-1 / PS-9)

BE at develop `1a4e52e` returns `ROLE_VAULT_OWNER` in the registration response. FE accepts the following explicit response role aliases at the shared `readUser` boundary:

| API role | FE internal role |
| --- | --- |
| ROLE_VAULT_OWNER | VAULT_OWNER |
| ROLE_STAFF_EXECUTOR | STAFF_EXECUTOR |
| ROLE_LEGAL_VERIFIER | LEGAL_VERIFIER |
| ROLE_ADMIN | ADMIN |
| ROLE_BENEFICIARY | BENEFICIARY |

Existing unprefixed FE/fixture values remain supported. Unknown roles and empty role arrays are rejected; aliases are deduplicated. Registration, login and session creation use the same normalization. Roles are not submitted by the registration form, and FE guards do not replace BE authorization. This change does not alter BE roles, JWT contents or database values.

Source: BE AuthService and FE contracts.js on the group repository. Regression tests verify registration HTTP 201, login/session normalization and rejection of invalid authorities. Real SQL Server integration still requires running BE and checking the saved account; these response tests do not demonstrate a DB connection.
