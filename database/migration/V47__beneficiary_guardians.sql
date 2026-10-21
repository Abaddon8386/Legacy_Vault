/* PS-113: additive only. Proposed slot after PS-112 V41 and PS-87/106 V42-V46.
   Recheck merge order before release; never renumber an already applied migration. */
ALTER TABLE dbo.beneficiaries ADD guardian_revision BIGINT NOT NULL
    CONSTRAINT DF_beneficiary_guardian_revision DEFAULT 0
    CONSTRAINT CK_beneficiary_guardian_revision CHECK (guardian_revision >= 0);

CREATE TABLE dbo.beneficiary_guardians (
    guardian_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_beneficiary_guardians PRIMARY KEY,
    beneficiary_id BIGINT NOT NULL REFERENCES dbo.beneficiaries(beneficiary_id),
    revision BIGINT NOT NULL CHECK (revision > 0),
    full_name NVARCHAR(150) NOT NULL CHECK (LEN(LTRIM(RTRIM(full_name))) > 0),
    relationship NVARCHAR(100) NOT NULL CHECK (LEN(LTRIM(RTRIM(relationship))) > 0),
    email NVARCHAR(254) NULL,
    phone_number NVARCHAR(20) NULL,
    created_by_user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
    created_at DATETIME2(7) NOT NULL CONSTRAINT DF_guardian_created DEFAULT SYSUTCDATETIME(),
    ended_at DATETIME2(7) NULL,
    ended_by_user_id BIGINT NULL REFERENCES dbo.users(user_id),
    end_reason VARCHAR(10) NULL,
    CONSTRAINT UQ_guardian_revision UNIQUE (beneficiary_id, revision),
    CONSTRAINT CK_guardian_contact CHECK (LEN(LTRIM(RTRIM(COALESCE(email,'')))) > 0
        OR LEN(LTRIM(RTRIM(COALESCE(phone_number,'')))) > 0),
    CONSTRAINT CK_guardian_end CHECK ((ended_at IS NULL AND ended_by_user_id IS NULL AND end_reason IS NULL)
        OR (ended_at IS NOT NULL AND ended_by_user_id IS NOT NULL AND end_reason IN ('REPLACED','REVOKED') AND ended_at >= created_at))
);
CREATE UNIQUE INDEX UX_guardian_current ON dbo.beneficiary_guardians(beneficiary_id) WHERE ended_at IS NULL;
