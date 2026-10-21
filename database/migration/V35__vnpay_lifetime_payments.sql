/* PS-80: only verified VNPay IPN rows are payment evidence. Historical prototypes stay untrusted. */
CREATE TABLE dbo.subscription_payments (
    payment_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_subscription_payments PRIMARY KEY,
    owner_user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
    idempotency_key UNIQUEIDENTIFIER NOT NULL,
    plan_code NVARCHAR(30) NOT NULL REFERENCES dbo.subscription_plans(plan_code),
    catalog_version INT NOT NULL,
    amount_vnd BIGINT NOT NULL,
    asset_limit BIGINT NOT NULL,
    storage_limit_bytes BIGINT NOT NULL,
    file_limit_bytes BIGINT NOT NULL,
    merchant_code VARCHAR(8) NOT NULL,
    status VARCHAR(10) NOT NULL CONSTRAINT DF_payment_status DEFAULT 'PENDING',
    created_at DATETIME2(0) NOT NULL,
    expires_at DATETIME2(0) NOT NULL,
    completed_at DATETIME2(0) NULL,
    gateway_transaction_no VARCHAR(15) NULL,
    response_code VARCHAR(2) NULL,
    transaction_status VARCHAR(2) NULL,
    CONSTRAINT UQ_payment_request UNIQUE(owner_user_id,idempotency_key),
    CONSTRAINT CK_payment_plan CHECK(plan_code IN ('STANDARD','EXTENDED')),
    CONSTRAINT CK_payment_values CHECK(catalog_version>0 AND amount_vnd>0 AND amount_vnd<=9999999999
        AND asset_limit>0 AND storage_limit_bytes>0 AND file_limit_bytes>0 AND file_limit_bytes<=storage_limit_bytes),
    CONSTRAINT CK_payment_state CHECK(status IN ('PENDING','SUCCEEDED','FAILED')),
    CONSTRAINT CK_payment_dates CHECK(expires_at>created_at),
    CONSTRAINT CK_payment_result CHECK(
      (status='PENDING' AND completed_at IS NULL AND gateway_transaction_no IS NULL AND response_code IS NULL AND transaction_status IS NULL)
      OR (status='FAILED' AND completed_at IS NOT NULL AND response_code IS NOT NULL AND transaction_status IS NOT NULL)
      OR (status='SUCCEEDED' AND completed_at IS NOT NULL AND gateway_transaction_no IS NOT NULL AND response_code='00' AND transaction_status='00'))
);
CREATE INDEX IX_payment_owner ON dbo.subscription_payments(owner_user_id,status,created_at);
CREATE UNIQUE INDEX UX_payment_gateway ON dbo.subscription_payments(merchant_code,gateway_transaction_no)
    WHERE gateway_transaction_no IS NOT NULL AND status='SUCCEEDED';
