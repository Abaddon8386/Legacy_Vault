package com.legacyvault.verification.entity;

import com.legacyvault.common.crypto.EncryptedData;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Một phiên bản văn bản căn cứ đã được Staff tiếp nhận và số hóa (ST-18, LV-BASIS-001). Bất biến: chỉ có cột chuyển Legal
 * ({@code forward*}) được cập nhật qua truy vấn riêng; phiên bản mới là bản ghi mới, phiên bản cũ giữ nguyên làm chứng cứ.
 * Nội dung file được mã hóa; {@code sha256Hash} tính trên nội dung gốc và chỉ để phát hiện thay đổi.
 */
@Entity
@Table(name = "legal_basis_dossier_versions", schema = "dbo")
public class LegalBasisDossierVersion {

    public static final String NOT_FORWARDED = "NOT_FORWARDED";
    public static final String FORWARDED = "FORWARDED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "dossier_version_id")
    private Long dossierVersionId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "legal_basis_dossier_id", nullable = false, updatable = false)
    private Long legalBasisDossierId;

    @Column(name = "version_no", nullable = false, updatable = false)
    private int versionNo;

    @Column(name = "file_reference", nullable = false, length = 500, updatable = false)
    private String fileReference;

    @Column(name = "sha256_hash", nullable = false, length = 64, updatable = false)
    private String sha256Hash;

    @Column(name = "version_notes", length = 1000, updatable = false)
    private String versionNotes;

    @Column(name = "created_by_user_id", nullable = false, updatable = false)
    private Long createdByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "forward_status", nullable = false, length = 20)
    private String forwardStatus = NOT_FORWARDED;

    @Column(name = "forwarded_by_user_id")
    private Long forwardedByUserId;

    @Column(name = "forwarded_at")
    private LocalDateTime forwardedAt;

    @Column(name = "legal_basis_type", length = 30, updatable = false)
    private String legalBasisType;

    @Column(name = "issuing_authority", length = 255, updatable = false)
    private String issuingAuthority;

    @Column(name = "document_number", length = 100, updatable = false)
    private String documentNumber;

    @Column(name = "issue_date", updatable = false)
    private LocalDate issueDate;

    @Column(name = "notary_authority", length = 255, updatable = false)
    private String notaryAuthority;

    @Column(name = "notarial_document_number", length = 100, updatable = false)
    private String notarialDocumentNumber;

    @Column(name = "notarized_at", updatable = false)
    private LocalDate notarizedAt;

    @Column(name = "evidence_metadata", updatable = false)
    private String evidenceMetadata;

    @Column(name = "original_file_name", length = 255, updatable = false)
    private String originalFileName;

    @Column(name = "content_type", length = 150, updatable = false)
    private String contentType;

    @Column(name = "file_size_bytes", updatable = false)
    private Long fileSizeBytes;

    @Column(name = "encrypted_file_content", updatable = false)
    private byte[] encryptedFileContent;

    @Column(name = "encryption_iv", updatable = false)
    private byte[] encryptionIv;

    @Column(name = "encryption_key_version", length = 50, updatable = false)
    private String encryptionKeyVersion;

    protected LegalBasisDossierVersion() {
    }

    public LegalBasisDossierVersion(Long legalBasisDossierId, int versionNo, String legalBasisType,
            String issuingAuthority, String documentNumber, LocalDate issueDate, String notaryAuthority,
            String notarialDocumentNumber, LocalDate notarizedAt, String evidenceMetadata, String versionNotes,
            String originalFileName, String contentType, long fileSizeBytes, String sha256Hash, Long createdByUserId) {
        this.publicId = UUID.randomUUID();
        this.legalBasisDossierId = legalBasisDossierId;
        this.versionNo = versionNo;
        this.legalBasisType = legalBasisType;
        this.issuingAuthority = issuingAuthority;
        this.documentNumber = documentNumber;
        this.issueDate = issueDate;
        this.notaryAuthority = notaryAuthority;
        this.notarialDocumentNumber = notarialDocumentNumber;
        this.notarizedAt = notarizedAt;
        this.evidenceMetadata = evidenceMetadata;
        this.versionNotes = versionNotes;
        this.originalFileName = originalFileName;
        this.contentType = contentType;
        this.fileSizeBytes = fileSizeBytes;
        this.sha256Hash = sha256Hash;
        this.createdByUserId = createdByUserId;
        // Tham chiếu do server sinh, không bao giờ nhận từ client (tránh dùng làm đường dẫn).
        this.fileReference = "dossier-version:" + publicId;
    }

    /** Mã hóa nội dung gắn với đúng phiên bản (AAD = UUID công khai của phiên bản). */
    public void setEncryptedContent(EncryptedData data) {
        this.encryptedFileContent = data.ciphertext();
        this.encryptionIv = data.iv();
        this.encryptionKeyVersion = data.keyVersion();
    }

    /** PS-103: ciphertext of the stored file; only the read service decrypts it, always with the version id as AAD. */
    public EncryptedData encryptedContent() {
        return new EncryptedData(encryptedFileContent, encryptionIv, encryptionKeyVersion);
    }

    public boolean hasStoredFile() {
        return encryptedFileContent != null && encryptionIv != null && encryptionKeyVersion != null
                && fileSizeBytes != null && fileSizeBytes > 0;
    }

    public String getContentType() {
        return contentType;
    }

    public String getOriginalFileName() {
        return originalFileName;
    }

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getDossierVersionId() {
        return dossierVersionId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getLegalBasisDossierId() {
        return legalBasisDossierId;
    }

    public int getVersionNo() {
        return versionNo;
    }

    public String getSha256Hash() {
        return sha256Hash;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public String getForwardStatus() {
        return forwardStatus;
    }
}
