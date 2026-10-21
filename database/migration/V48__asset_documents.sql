/*
 * LegacyVault - V48 (PS-114)
 * Purpose: encrypted PDF / Word documents attached to an Owner's TEXT or CREDENTIAL Asset (SWP bug #21).
 *   - One row per file, AES-256-GCM like asset images (ciphertext = plaintext + 16-byte tag), SHA-256 of the original bytes.
 *   - Not a Will (those are DOCUMENT Assets with versions) and not Staff intake evidence (V40): a separate table.
 *   - Bytes count toward the Owner storage quota; the document does not occupy an Asset slot.
 * Notes:
 *   - V47 is reserved by the PS-113 (guardian) branch. If PS-113 merges AFTER this migration is applied, Flyway would
 *     reject V47 as out of order: merge PS-113 first or renumber one of them before merging.
 *   - No trigger: Owners may delete a document to free storage; the service guards every write.
 */
CREATE TABLE dbo.asset_documents (
    document_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_documents PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_asset_documents_public_id DEFAULT NEWID(),
    asset_id BIGINT NOT NULL CONSTRAINT FK_asset_documents_asset REFERENCES dbo.assets(asset_id),
    file_name NVARCHAR(255) NOT NULL,
    content_type NVARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_hash CHAR(64) NOT NULL,
    encrypted_content VARBINARY(MAX) NOT NULL,
    encryption_iv BINARY(12) NOT NULL,
    key_version NVARCHAR(50) NOT NULL,
    created_at DATETIME2(7) NOT NULL CONSTRAINT DF_asset_documents_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_asset_documents_public_id UNIQUE (public_id),
    CONSTRAINT CK_asset_documents_type CHECK (content_type IN (N'application/pdf', N'application/msword',
        N'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
    CONSTRAINT CK_asset_documents_size CHECK (file_size_bytes > 0),
    CONSTRAINT CK_asset_documents_hash CHECK (LEN(sha256_hash) = 64),
    CONSTRAINT CK_asset_documents_encryption CHECK (DATALENGTH(encrypted_content) = file_size_bytes + 16)
);
CREATE INDEX IX_asset_documents_asset ON dbo.asset_documents(asset_id, document_id);
GO
