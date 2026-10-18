/* PS-60: append-only handover session history with at most one OPEN session per case. */
CREATE TABLE dbo.handover_sessions (
    handover_session_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_handover_sessions_public_id DEFAULT NEWID(),
    verification_case_id BIGINT NOT NULL,
    staff_user_id BIGINT NOT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_handover_sessions_status DEFAULT N'OPEN',
    opened_at DATETIME2 NOT NULL CONSTRAINT DF_handover_sessions_opened_at DEFAULT SYSUTCDATETIME(),
    closed_at DATETIME2 NULL,
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_handover_sessions_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_handover_sessions PRIMARY KEY (handover_session_id),
    CONSTRAINT UQ_handover_sessions_public_id UNIQUE (public_id),
    CONSTRAINT FK_handover_sessions_case FOREIGN KEY (verification_case_id)
        REFERENCES dbo.verification_cases(verification_case_id),
    CONSTRAINT FK_handover_sessions_staff FOREIGN KEY (staff_user_id)
        REFERENCES dbo.users(user_id),
    CONSTRAINT CK_handover_sessions_status CHECK (status IN (N'OPEN', N'COMPLETED', N'CANCELLED'))
);

CREATE INDEX IX_handover_sessions_case_staff_opened
    ON dbo.handover_sessions(verification_case_id, staff_user_id, opened_at DESC);

CREATE UNIQUE INDEX UX_handover_sessions_one_open_per_case
    ON dbo.handover_sessions(verification_case_id)
    WHERE status = N'OPEN';
