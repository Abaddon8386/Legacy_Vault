-- Existing confirmations remain readable; new HTTP confirmations require signed evidence.
ALTER TABLE dbo.beneficiary_confirmations ADD
 paper_receipt_reference nvarchar(200) NULL,
 signed_file_ciphertext varbinary(max) NULL,
 signed_file_iv varbinary(12) NULL,
 signed_file_key_version varchar(64) NULL,
 signed_file_name nvarchar(255) NULL,
 signed_file_type varchar(100) NULL,
 signed_file_sha256 varchar(64) NULL;
GO
ALTER TABLE dbo.beneficiary_confirmations ADD CONSTRAINT CK_confirmation_signed_file CHECK (
 (signed_file_ciphertext IS NULL AND signed_file_iv IS NULL AND signed_file_key_version IS NULL AND signed_file_name IS NULL AND signed_file_type IS NULL AND signed_file_sha256 IS NULL)
 OR (signed_file_ciphertext IS NOT NULL AND signed_file_iv IS NOT NULL AND DATALENGTH(signed_file_iv)=12 AND signed_file_key_version IS NOT NULL AND signed_file_name IS NOT NULL AND signed_file_type IS NOT NULL AND signed_file_sha256 IS NOT NULL));
