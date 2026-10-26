CREATE TABLE dbo.asset_images (
    image_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_images PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_asset_images_public UNIQUE,
    asset_id BIGINT NOT NULL CONSTRAINT FK_asset_images_asset REFERENCES dbo.assets(asset_id),
    slot_no INT NOT NULL CONSTRAINT CK_asset_images_slot CHECK (slot_no BETWEEN 1 AND 5),
    file_name NVARCHAR(255) NOT NULL,
    content_type NVARCHAR(40) NOT NULL CONSTRAINT CK_asset_images_type CHECK (content_type IN (N'image/jpeg',N'image/png')),
    file_size_bytes BIGINT NOT NULL CONSTRAINT CK_asset_images_size CHECK (file_size_bytes BETWEEN 1 AND 5242880),
    encrypted_content VARBINARY(MAX) NOT NULL,
    encryption_iv VARBINARY(12) NOT NULL,
    key_version NVARCHAR(50) NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_asset_images_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_asset_images_slot UNIQUE (asset_id,slot_no),
    CONSTRAINT CK_asset_images_encryption CHECK (DATALENGTH(encrypted_content)=file_size_bytes+16 AND DATALENGTH(encryption_iv)=12)
);
