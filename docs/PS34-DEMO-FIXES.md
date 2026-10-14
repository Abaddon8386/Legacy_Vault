# PS-3/4 demo fixes — 2026-10-14

Base: develop 5bd3306. Branch: feature/PS-3-4-vault-overview-fixes.

- Remove public UUID and fixed, unsupported data-protection status from main Vault presentation.
- Add independent API-backed asset total, beneficiary count/configuration requirement and DMS next confirmation. Unavailable responses never become fabricated zero counts; 401 invalidates the session. Partial endpoint failure does not hide the other statistics.
- Vietnamese navigation and DMS title omit internal English terminology.
- DMS header has an explicit stacking order so the information popover remains above animated content; width constrained for small screens.

Validation: 154 FE tests passed, ESLint and Vite build passed, git diff --check passed. Desktop browser verified API fixture counts (one asset, zero beneficiaries), unavailable DMS summary and complete visible DMS info popover. Screenshots use synthetic data, not real SQL Server evidence.

Related BE review: owner-open-will branch b57faa6 includes owner-reveal-asset changes. Focused AssetControllerTest, AssetServiceTest, PasswordReauthServiceTest, WillControllerTest and WillServiceTest: 74 tests passed. Ownership, ACTIVE guard, password reauthentication, no-store responses, audit and file integrity checks exist. These additions are now merged into develop through PRs #49 and #51. Reauth limit 5 failures/15 minutes is marked pending team confirmation in D-API-32/33; real SQL Server integration was not run here.

Not covered: asset reveal UI, will download/history UI, diagnosing the previously reported GET /vaults empty response, or merging BE branches. Those remain separate integration work.

Final review: preview navigation preserves scenario/language, shared in-memory DMS state retains saves/check-ins and the chosen interval. Wills/beneficiaries preview shows an explicit availability notice rather than calling unauthenticated live endpoints. Generic live DMS 404 is unavailable, never proof of unconfigured DMS; backend needs an unambiguous state before enabling that interpretation. Live registration/login/vault creation/read were exercised by the user on a separate local test database; beneficiary/configuration/DMS integration remains pending BE PS-19–23. No local secret, database configuration or native DLL is included in this change.
