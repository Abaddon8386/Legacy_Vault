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

    /**
     * Trạng thái chuyển tiếp: chưa chuyển cho Legal.
     */
    public static final String NOT_FORWARDED = "NOT_FORWARDED";
    /**
     * Trạng thái chuyển tiếp: đã chuyển cho Legal.
     */
    public static final String FORWARDED = "FORWARDED";

    /**
     * Khóa chính nội bộ {@code dossier_version_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "dossier_version_id")
    private Long dossierVersionId;

    /**
     * Mã công khai (UUID); cũng là AAD khi mã hóa file.
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id hồ sơ căn cứ ({@code legal_basis_dossiers}).
     */
    @Column(name = "legal_basis_dossier_id", nullable = false, updatable = false)
    private Long legalBasisDossierId;

    /**
     * Số thứ tự phiên bản trong hồ sơ.
     */
    @Column(name = "version_no", nullable = false, updatable = false)
    private int versionNo;

    /**
     * Tham chiếu file do server sinh dạng {@code dossier-version:<uuid>}, không nhận từ client.
     */
    @Column(name = "file_reference", nullable = false, length = 500, updatable = false)
    private String fileReference;

    /**
     * SHA-256 của nội dung gốc, chỉ để phát hiện thay đổi.
     */
    @Column(name = "sha256_hash", nullable = false, length = 64, updatable = false)
    private String sha256Hash;

    /**
     * Ghi chú của phiên bản (tùy chọn).
     */
    @Column(name = "version_notes", length = 1000, updatable = false)
    private String versionNotes;

    /**
     * Id Staff tạo phiên bản.
     */
    @Column(name = "created_by_user_id", nullable = false, updatable = false)
    private Long createdByUserId;

    /**
     * Thời điểm tạo (UTC).
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Trạng thái chuyển Legal: {@link #NOT_FORWARDED} hoặc {@link #FORWARDED}; cột có thể cập nhật qua truy vấn riêng.
     */
    @Column(name = "forward_status", nullable = false, length = 20)
    private String forwardStatus = NOT_FORWARDED;

    /**
     * Id Staff đã chuyển phiên bản cho Legal.
     */
    @Column(name = "forwarded_by_user_id")
    private Long forwardedByUserId;

    /**
     * Thời điểm chuyển cho Legal.
     */
    @Column(name = "forwarded_at")
    private LocalDateTime forwardedAt;

    /**
     * Loại căn cứ pháp lý (ví dụ văn bản công chứng hoặc quyết định tòa án).
     */
    @Column(name = "legal_basis_type", length = 30, updatable = false)
    private String legalBasisType;

    /**
     * Cơ quan ban hành văn bản.
     */
    @Column(name = "issuing_authority", length = 255, updatable = false)
    private String issuingAuthority;

    /**
     * Số văn bản.
     */
    @Column(name = "document_number", length = 100, updatable = false)
    private String documentNumber;

    /**
     * Ngày ban hành.
     */
    @Column(name = "issue_date", updatable = false)
    private LocalDate issueDate;

    /**
     * Cơ quan/tổ chức công chứng (nhánh NOTARIAL).
     */
    @Column(name = "notary_authority", length = 255, updatable = false)
    private String notaryAuthority;

    /**
     * Số văn bản công chứng.
     */
    @Column(name = "notarial_document_number", length = 100, updatable = false)
    private String notarialDocumentNumber;

    /**
     * Ngày công chứng.
     */
    @Column(name = "notarized_at", updatable = false)
    private LocalDate notarizedAt;

    /**
     * Metadata bằng chứng (chuỗi mô tả thêm).
     */
    @Column(name = "evidence_metadata", updatable = false)
    private String evidenceMetadata;

    /**
     * Tên file gốc tải lên.
     */
    @Column(name = "original_file_name", length = 255, updatable = false)
    private String originalFileName;

    /**
     * Content-Type của file.
     */
    @Column(name = "content_type", length = 150, updatable = false)
    private String contentType;

    /**
     * Kích thước file gốc (byte).
     */
    @Column(name = "file_size_bytes", updatable = false)
    private Long fileSizeBytes;

    /**
     * Nội dung file đã mã hóa (ciphertext).
     */
    @Column(name = "encrypted_file_content", updatable = false)
    private byte[] encryptedFileContent;

    /**
     * IV của phép mã hóa AES-GCM.
     */
    @Column(name = "encryption_iv", updatable = false)
    private byte[] encryptionIv;

    /**
     * Phiên bản khóa mã hóa đã dùng.
     */
    @Column(name = "encryption_key_version", length = 50, updatable = false)
    private String encryptionKeyVersion;

    /**
     * Constructor không tham số cho JPA.
     */
    protected LegalBasisDossierVersion() {
    }

    /**
     * Tạo phiên bản mới (chưa có nội dung mã hóa) và sinh {@code publicId} cùng {@code fileReference}.
     * @param legalBasisDossierId   id hồ sơ căn cứ
     * @param versionNo             số phiên bản
     * @param legalBasisType        loại căn cứ pháp lý
     * @param issuingAuthority      cơ quan ban hành
     * @param documentNumber        số văn bản
     * @param issueDate             ngày ban hành
     * @param notaryAuthority       cơ quan công chứng
     * @param notarialDocumentNumber số văn bản công chứng
     * @param notarizedAt           ngày công chứng
     * @param evidenceMetadata      metadata bằng chứng
     * @param versionNotes          ghi chú phiên bản
     * @param originalFileName      tên file gốc
     * @param contentType           Content-Type
     * @param fileSizeBytes         kích thước file
     * @param sha256Hash            SHA-256 nội dung gốc
     * @param createdByUserId       id Staff tạo
     */
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

    /**
     * Mã hóa nội dung gắn với đúng phiên bản (AAD = UUID công khai của phiên bản). Lưu ciphertext, IV, phiên bản khóa vào thực thể.
     * @param data kết quả mã hóa
     */
    public void setEncryptedContent(EncryptedData data) {
        this.encryptedFileContent = data.ciphertext();
        this.encryptionIv = data.iv();
        this.encryptionKeyVersion = data.keyVersion();
    }

    /**
     * PS-103: ciphertext of the stored file; only the read service decrypts it, always with the version id as AAD.
     * @return gói ciphertext/IV/phiên bản khóa
     */
    public EncryptedData encryptedContent() {
        return new EncryptedData(encryptedFileContent, encryptionIv, encryptionKeyVersion);
    }

    /**
     * @return true nếu đã có đủ nội dung mã hóa, IV, phiên bản khóa và kích thước dương
     */
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

    /**
     * Trước khi lưu: đặt {@code createdAt} (UTC) nếu chưa có.
     */
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
