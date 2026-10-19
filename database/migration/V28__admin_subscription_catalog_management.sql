/* PS-82: Admin subscription catalog management, versioning, concurrency and audit constraints */

CREATE TABLE dbo.subscription_plan_versions (
    version_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_subscription_plan_versions PRIMARY KEY,
    plan_code NVARCHAR(30) NOT NULL CONSTRAINT FK_sub_plan_versions_plan REFERENCES dbo.subscription_plans(plan_code),
    version INT NOT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_sub_ver_status DEFAULT (N'DRAFT'),
    name_vi NVARCHAR(100) NOT NULL,
    name_en NVARCHAR(100) NOT NULL,
    description_vi NVARCHAR(500) NULL,
    description_en NVARCHAR(500) NULL,
    monthly_price_vnd BIGINT NOT NULL CONSTRAINT DF_sub_ver_price DEFAULT (0),
    billing_model NVARCHAR(20) NOT NULL CONSTRAINT DF_sub_ver_billing DEFAULT (N'MONTHLY'),
    asset_limit BIGINT NOT NULL,
    storage_limit_bytes BIGINT NOT NULL,
    file_limit_bytes BIGINT NOT NULL CONSTRAINT DF_sub_ver_file_limit DEFAULT (10485760),
    concurrency_token BIGINT NOT NULL CONSTRAINT DF_sub_ver_concurrency DEFAULT (0),
    created_by_user_id BIGINT NULL CONSTRAINT FK_sub_plan_created_by REFERENCES dbo.users(user_id),
    published_by_user_id BIGINT NULL CONSTRAINT FK_sub_plan_published_by REFERENCES dbo.users(user_id),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_sub_plan_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_sub_plan_updated_at DEFAULT SYSUTCDATETIME(),
    published_at DATETIME2 NULL,
    deprecated_at DATETIME2 NULL,
    change_note NVARCHAR(500) NULL,
    CONSTRAINT CK_sub_plan_version_status CHECK (status IN (N'DRAFT', N'PUBLISHED', N'DEPRECATED')),
    CONSTRAINT CK_sub_plan_version_billing CHECK (billing_model = N'MONTHLY'),
    CONSTRAINT CK_sub_plan_version_file_limit CHECK (file_limit_bytes = 10485760),
    CONSTRAINT CK_sub_plan_version_limits CHECK (
        version > 0 AND monthly_price_vnd >= 0
        AND asset_limit > 0 AND storage_limit_bytes >= file_limit_bytes
    ),
    CONSTRAINT UQ_sub_plan_code_version UNIQUE (plan_code, version)
);

-- Concurrency index: ensure AT MOST ONE DRAFT per plan
CREATE UNIQUE NONCLUSTERED INDEX UQ_sub_plan_versions_draft
ON dbo.subscription_plan_versions (plan_code)
WHERE status = N'DRAFT';

-- Concurrency index: ensure AT MOST ONE PUBLISHED per plan
CREATE UNIQUE NONCLUSTERED INDEX UQ_sub_plan_versions_published
ON dbo.subscription_plan_versions (plan_code)
WHERE status = N'PUBLISHED';

CREATE INDEX IX_sub_plan_versions_code_status
ON dbo.subscription_plan_versions (plan_code, status);

-- Seed initial history and published versions with correct PS-82 pricing & quotas
INSERT INTO dbo.subscription_plan_versions
    (plan_code, version, status, name_vi, name_en, description_vi, description_en,
     monthly_price_vnd, billing_model, asset_limit, storage_limit_bytes, file_limit_bytes,
     concurrency_token, published_at)
VALUES
    -- BASIC: free, 5 assets, 100 MB, 10 MB file
    (N'BASIC', 1, N'PUBLISHED', N'Cơ bản', N'Basic Plan',
     N'Gói mặc định miễn phí cho mọi tài khoản chủ kho di sản.', N'Default free plan for all heritage vault owners.',
     0, N'MONTHLY', 5, 104857600, 10485760, 0, SYSUTCDATETIME()),

    -- STANDARD: 29.000 VND / month, 50 assets, 1 GB, 10 MB file
    (N'STANDARD', 1, N'PUBLISHED', N'Tiêu chuẩn', N'Standard Plan',
     N'Gói tiêu chuẩn dành cho gia đình và cá nhân cần mở rộng lưu trữ di sản số.', N'Standard plan for families needing expanded digital heritage storage.',
     29000, N'MONTHLY', 50, 1073741824, 10485760, 0, SYSUTCDATETIME()),

    -- EXTENDED: 59.000 VND / month, 200 assets, 5 GB, 10 MB file
    (N'EXTENDED', 1, N'PUBLISHED', N'Mở rộng', N'Extended Plan',
     N'Gói mở rộng dung lượng tối đa cho di sản tài liệu và tư liệu số quan trọng.', N'Extended plan offering maximum capacity for vital digital records and media.',
     59000, N'MONTHLY', 200, 5368709120, 10485760, 0, SYSUTCDATETIME());

-- Also seed 1 draft for STANDARD (version 2)
INSERT INTO dbo.subscription_plan_versions
    (plan_code, version, status, name_vi, name_en, description_vi, description_en,
     monthly_price_vnd, billing_model, asset_limit, storage_limit_bytes, file_limit_bytes,
     concurrency_token, change_note)
VALUES
    (N'STANDARD', 2, N'DRAFT', N'Tiêu chuẩn (Bản nháp)', N'Standard Plan (Draft)',
     N'Bản nháp đề xuất nâng cấp nội dung hiển thị cho chu kỳ mới.', N'Proposed draft for updated display metadata in new billing cycle.',
     29000, N'MONTHLY', 50, 1073741824, 10485760, 0, N'Khởi tạo bản nháp cấu hình cho kỳ tiếp theo');
