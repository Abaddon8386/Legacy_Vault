-- PS-72: archived content remains read-only, including requests started before archive.
-- Audit INSERT and account-level profile/subscription operations remain allowed.
-- No historical records are removed. Numeric error 51300 maps to VAULT_NOT_EDITABLE.
ALTER TABLE dbo.verification_cases ADD closed_handover_session_id BIGINT NULL;
ALTER TABLE dbo.verification_cases ADD CONSTRAINT FK_case_closed_handover_session
 FOREIGN KEY(closed_handover_session_id) REFERENCES dbo.handover_sessions(handover_session_id);
GO
CREATE TRIGGER dbo.TR_archived_vault_immutable ON dbo.vaults AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted WHERE status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_assets ON dbo.assets AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT vault_id FROM inserted UNION ALL SELECT vault_id FROM deleted) x JOIN dbo.vaults v ON v.vault_id=x.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_trustees ON dbo.trustees AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT vault_id FROM inserted UNION ALL SELECT vault_id FROM deleted) x JOIN dbo.vaults v ON v.vault_id=x.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_beneficiaries ON dbo.beneficiaries AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT vault_id FROM inserted UNION ALL SELECT vault_id FROM deleted) x JOIN dbo.vaults v ON v.vault_id=x.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_verification_cases ON dbo.verification_cases AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT vault_id FROM inserted UNION ALL SELECT vault_id FROM deleted) x JOIN dbo.vaults v ON v.vault_id=x.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_asset_versions ON dbo.asset_versions AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT asset_id FROM inserted UNION ALL SELECT asset_id FROM deleted) x JOIN dbo.assets a ON a.asset_id=x.asset_id JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_legal_documents ON dbo.legal_documents AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT asset_id FROM inserted UNION ALL SELECT asset_id FROM deleted) x JOIN dbo.assets a ON a.asset_id=x.asset_id JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_legal_verifications ON dbo.legal_verifications AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT legal_document_id FROM inserted UNION ALL SELECT legal_document_id FROM deleted) x JOIN dbo.legal_documents l ON l.legal_document_id=x.legal_document_id JOIN dbo.assets a ON a.asset_id=l.asset_id JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_trustee_contact_records ON dbo.trustee_contact_records AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT trustee_id FROM inserted UNION ALL SELECT trustee_id FROM deleted) x JOIN dbo.trustees t ON t.trustee_id=x.trustee_id JOIN dbo.vaults v ON v.vault_id=t.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_beneficiary_identity_verifications ON dbo.beneficiary_identity_verifications AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT beneficiary_id FROM inserted UNION ALL SELECT beneficiary_id FROM deleted) x JOIN dbo.beneficiaries b ON b.beneficiary_id=x.beneficiary_id JOIN dbo.vaults v ON v.vault_id=b.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_dms_configs ON dbo.dms_configs AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT owner_user_id FROM inserted UNION ALL SELECT owner_user_id FROM deleted) x JOIN dbo.vaults v ON v.owner_user_id=x.owner_user_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_vitality_check_logs ON dbo.vitality_check_logs AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT dms_id FROM inserted UNION ALL SELECT dms_id FROM deleted) x JOIN dbo.dms_configs d ON d.dms_id=x.dms_id JOIN dbo.vaults v ON v.owner_user_id=d.owner_user_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_death_document_records ON dbo.death_document_records AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT verification_case_id FROM inserted UNION ALL SELECT verification_case_id FROM deleted) x JOIN dbo.verification_cases c ON c.verification_case_id=x.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_original_will_intakes ON dbo.original_will_intakes AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT verification_case_id FROM inserted UNION ALL SELECT verification_case_id FROM deleted) x JOIN dbo.verification_cases c ON c.verification_case_id=x.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_will_comparisons ON dbo.will_comparisons AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT verification_case_id FROM inserted UNION ALL SELECT verification_case_id FROM deleted) x JOIN dbo.verification_cases c ON c.verification_case_id=x.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_legal_basis_dossiers ON dbo.legal_basis_dossiers AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT verification_case_id FROM inserted UNION ALL SELECT verification_case_id FROM deleted) x JOIN dbo.verification_cases c ON c.verification_case_id=x.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_handover_sessions ON dbo.handover_sessions AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT verification_case_id FROM inserted UNION ALL SELECT verification_case_id FROM deleted) x JOIN dbo.verification_cases c ON c.verification_case_id=x.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_legal_basis_dossier_versions ON dbo.legal_basis_dossier_versions AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT legal_basis_dossier_id FROM inserted UNION ALL SELECT legal_basis_dossier_id FROM deleted) x JOIN dbo.legal_basis_dossiers d ON d.legal_basis_dossier_id=x.legal_basis_dossier_id JOIN dbo.verification_cases c ON c.verification_case_id=d.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_legal_basis_classification_history ON dbo.legal_basis_classification_history AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT legal_basis_dossier_id FROM inserted UNION ALL SELECT legal_basis_dossier_id FROM deleted) x JOIN dbo.legal_basis_dossiers d ON d.legal_basis_dossier_id=x.legal_basis_dossier_id JOIN dbo.verification_cases c ON c.verification_case_id=d.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_legal_basis_version_allocations ON dbo.legal_basis_version_allocations AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT dossier_version_id FROM inserted UNION ALL SELECT dossier_version_id FROM deleted) x JOIN dbo.legal_basis_dossier_versions dv ON dv.dossier_version_id=x.dossier_version_id JOIN dbo.legal_basis_dossiers d ON d.legal_basis_dossier_id=dv.legal_basis_dossier_id JOIN dbo.verification_cases c ON c.verification_case_id=d.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_court_decisions ON dbo.court_decisions AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT dossier_version_id FROM inserted UNION ALL SELECT dossier_version_id FROM deleted) x JOIN dbo.legal_basis_dossier_versions dv ON dv.dossier_version_id=x.dossier_version_id JOIN dbo.legal_basis_dossiers d ON d.legal_basis_dossier_id=dv.legal_basis_dossier_id JOIN dbo.verification_cases c ON c.verification_case_id=d.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_legal_basis_review_history ON dbo.legal_basis_review_history AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT legal_basis_dossier_id FROM inserted UNION ALL SELECT legal_basis_dossier_id FROM deleted) x JOIN dbo.legal_basis_dossiers d ON d.legal_basis_dossier_id=x.legal_basis_dossier_id JOIN dbo.verification_cases c ON c.verification_case_id=d.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_handover_items ON dbo.handover_items AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT handover_session_id FROM inserted UNION ALL SELECT handover_session_id FROM deleted) x JOIN dbo.handover_sessions s ON s.handover_session_id=x.handover_session_id JOIN dbo.verification_cases c ON c.verification_case_id=s.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_handover_receipts ON dbo.handover_receipts AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT handover_session_id FROM inserted UNION ALL SELECT handover_session_id FROM deleted) x JOIN dbo.handover_sessions s ON s.handover_session_id=x.handover_session_id JOIN dbo.verification_cases c ON c.verification_case_id=s.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_beneficiary_confirmations ON dbo.beneficiary_confirmations AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT handover_session_id FROM inserted UNION ALL SELECT handover_session_id FROM deleted) x JOIN dbo.handover_sessions s ON s.handover_session_id=x.handover_session_id JOIN dbo.verification_cases c ON c.verification_case_id=s.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_handover_completion_evidence ON dbo.handover_completion_evidence AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT handover_session_id FROM inserted UNION ALL SELECT handover_session_id FROM deleted) x JOIN dbo.handover_sessions s ON s.handover_session_id=x.handover_session_id JOIN dbo.verification_cases c ON c.verification_case_id=s.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
CREATE TRIGGER dbo.TR_archive_guard_handover_receipt_assets ON dbo.handover_receipt_assets AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT handover_receipt_id FROM inserted UNION ALL SELECT handover_receipt_id FROM deleted) x JOIN dbo.handover_receipts r ON r.handover_receipt_id=x.handover_receipt_id JOIN dbo.handover_sessions s ON s.handover_session_id=r.handover_session_id JOIN dbo.verification_cases c ON c.verification_case_id=s.verification_case_id JOIN dbo.vaults v ON v.vault_id=c.vault_id WHERE v.status=N'ARCHIVED')
  THROW 51300,'Archived Vault content is read-only.',1;
END;
GO
