# PS-115 implementation checkpoint

Base: develop `15a9cc6`. Read live Jira PS-113/115 and related PS-80/82/86/87/92/104/106/109/114/116/117. Older monthly pricing in PS-80/82 descriptions conflicts with the later approved lifetime decision; implementation follows the current V32/V35 snapshot model and PS-92 clarification. No Jira fields changed.

Implemented: existing Admin transactions placeholder now returns real SQL Server pages; additional detail route; exact account/email/payment/gateway reference search, account/status/UTC-range filters, deterministic order and bounded page size. Whitelisted public DTO and fixture/OpenAPI are in admin-payment-transactions.md/admin-payments.openapi.yaml. No new migration or changes to checkout/IPN/catalog/quota/user-admin behavior.

Targeted tests: 43 passed, no failures/errors/skips across AdminSubscriptionServiceTest (13), AdminSubscriptionControllerTest (11), PaymentSqlServerTest (17), SubscriptionContractTest (1), SubscriptionPolicyPendingTest (1). The initial new snapshot fixture used the wrong column name; corrected to purchase_price_vnd, then reran the payment suite successfully. All SQL tests use disposable local databases with synthetic signed callback fixtures, not a real VNPay gateway.

AC trace:

- Real source/list/detail/filter/pagination/empty vs unavailable -> PaymentRepository adminList/adminDetail, AdminSubscriptionService lookupTransactions/transactionDetail; service/controller tests and SQL integration.
- Payment-time price/plan/limits history -> no join to current plan for returned snapshot; SQL test changes current catalog and verifies the old paid snapshot is retained.
- IPN/read consistency -> short SERIALIZABLE count/page transaction; SQL race with a verified fixture IPN. No NOLOCK, no network inside transaction. Possible temporary blocking is explicit in the contract; high-volume query performance is not benchmarked.
- Actual JWT boundary -> SQL-backed roles, forged claim without DB role denied; inactive/deleted/expired credentials denied; whitelisted detail excludes merchant/idempotency/checkout/provider-code fields.
- Catalog/usage regression -> existing Admin service tests retain real usage repository delegation and current effective payment lookup. No quota/count definition is changed; PS-92 remains the owner of enforcement/count rollout.

No real merchant configuration, real email, shared DB changes, merge, push or PR for this task. Frontend integration remains Thái's PS-82 work; the existing frontend dependency placeholder is not declared fixed. Final review/full regression and frontend browser acceptance remain before merge, as requested. Rebase against then-current PS-109/112/auth and PS-92 changes before that review; no claim of testing unmerged colleague code.
