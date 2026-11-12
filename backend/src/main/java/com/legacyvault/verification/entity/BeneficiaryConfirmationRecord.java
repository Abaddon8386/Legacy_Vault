package com.legacyvault.verification.entity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
/**
 * Immutable Staff recording of a Beneficiary's separate counter confirmation.
 * <p>
 * Bảng {@code dbo.beneficiary_confirmations}. Mỗi dòng là một xác nhận đối soát của một người nhận trong một phiên bàn giao
 * ({@code handover_sessions}) gắn với một phiên bản hồ sơ căn cứ ({@code legal_basis_dossier_versions}). Chỉ thêm mới; chỉ phần
 * file biên nhận đã ký có thể được đính kèm đúng một lần qua {@link #attachSignedFile}. Được {@code BeneficiaryReconciliationService} tạo
 * và đọc; số lượng xác nhận là đầu vào của {@code BeneficiaryCompletionProgress}.
 */
@Entity @Table(name="beneficiary_confirmations", schema="dbo")
public class BeneficiaryConfirmationRecord {
    /**
     * Khóa chính nội bộ {@code confirmation_id} (IDENTITY).
     */
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="confirmation_id") private Long id;
    /**
     * Mã công khai (UUID) dùng ở API thay cho khóa nội bộ.
     */
    @Column(name="public_id",nullable=false,unique=true,updatable=false) private UUID publicId=UUID.randomUUID();
    /**
     * Id phiên bàn giao ({@code handover_sessions}) mà xác nhận thuộc về.
     */
    @Column(name="handover_session_id",nullable=false,updatable=false) private Long sessionId;
    /**
     * Id phiên bản hồ sơ căn cứ ({@code legal_basis_dossier_versions}) mà phạm vi bàn giao dựa trên.
     */
    @Column(name="dossier_version_id",nullable=false,updatable=false) private Long versionId;
    /**
     * Hash SHA-256 (64 ký tự hex) của phạm vi phân bổ tại thời điểm xác nhận, để phát hiện phạm vi bị đổi sau đó.
     */
    @Column(name="scope_hash",nullable=false,updatable=false,length=64) private String scopeHash;
    /**
     * Id người nhận được xác nhận.
     */
    @Column(name="beneficiary_id",nullable=false,updatable=false) private Long beneficiaryId;
    /**
     * Id Staff đã ghi nhận xác nhận (lấy từ ngữ cảnh đăng nhập phía server).
     */
    @Column(name="confirmed_by_user_id",nullable=false,updatable=false) private Long actorId;
    /**
     * Thời điểm xác nhận (UTC).
     */
    @Column(name="confirmed_at",nullable=false,updatable=false) private LocalDateTime confirmedAt;
    /**
     * Mã tham chiếu biên nhận do Staff nhập (nhạy cảm, không nên ghi vào log).
     */
    @Column(name="receipt_reference",nullable=false,updatable=false,length=200) private String reference;
    /**
     * Nội dung file biên nhận đã ký, mã hóa AES-GCM (có thể null nếu chưa đính kèm).
     */
    @Column(name="signed_file_ciphertext",columnDefinition="varbinary(max)") private byte[] signedFile;
    /**
     * Vector khởi tạo (IV 12 byte) của AES-GCM cho file đã ký.
     */
    @Column(name="signed_file_iv",columnDefinition="varbinary(12)") private byte[] signedIv;
    /**
     * Phiên bản khóa mã hóa đã dùng cho file đã ký.
     */
    @Column(name="signed_file_key_version",length=64) private String signedKeyVersion;
    /**
     * Tên file gốc của biên nhận đã ký.
     */
    @Column(name="signed_file_name",length=255) private String signedFileName;
    /**
     * Content-Type của file đã ký.
     */
    @Column(name="signed_file_type",length=100) private String signedFileType;
    /**
     * SHA-256 của nội dung gốc file đã ký, chỉ dùng phát hiện thay đổi.
     */
    @Column(name="signed_file_sha256",length=64) private String signedSha256;
    /**
     * Mã tham chiếu biên nhận giấy (tùy chọn).
     */
    @Column(name="paper_receipt_reference",length=200) private String paperReference;
    /**
     * Gán mã biên nhận giấy.
     * @param value mã tham chiếu biên nhận giấy
     */
    public void setPaperReference(String value){paperReference=value;}
    /**
     * Đính kèm file biên nhận đã ký (đã mã hóa) đúng một lần; sau đó bản ghi bất biến.
     * @param encrypted dữ liệu mã hóa gồm ciphertext, IV, phiên bản khóa
     * @param name      tên file gốc
     * @param type      Content-Type
     * @param hash      SHA-256 của nội dung gốc
     * @throws IllegalStateException nếu đã đính kèm file trước đó
     */
    public void attachSignedFile(com.legacyvault.common.crypto.EncryptedData encrypted, String name, String type, String hash) {
        if(signedFile != null) throw new IllegalStateException("Receipt is immutable");
        signedFile=encrypted.ciphertext(); signedIv=encrypted.iv(); signedKeyVersion=encrypted.keyVersion();
        signedFileName=name; signedFileType=type; signedSha256=hash;
    }
    /**
     * @return true nếu đã có file biên nhận đã ký
     */
    public boolean hasSignedFile(){return signedFile != null;}
    public Long getSessionId(){return sessionId;}
    public String getSignedFileName(){return signedFileName;} public String getSignedFileType(){return signedFileType;}
    public String getSignedSha256(){return signedSha256;}
    /**
     * @return gói ciphertext/IV/phiên bản khóa của file đã ký để service giải mã
     */
    public com.legacyvault.common.crypto.EncryptedData signedData(){return new com.legacyvault.common.crypto.EncryptedData(signedFile,signedIv,signedKeyVersion);}
    /**
     * Constructor không tham số cho JPA.
     */
    protected BeneficiaryConfirmationRecord() {}
    /**
     * Tạo một xác nhận mới (chưa có file đã ký).
     * @param sessionId     id phiên bàn giao
     * @param versionId     id phiên bản hồ sơ căn cứ
     * @param scopeHash     hash phạm vi phân bổ
     * @param beneficiaryId id người nhận
     * @param actorId       id Staff ghi nhận
     * @param at            thời điểm xác nhận (UTC)
     * @param reference     mã tham chiếu biên nhận
     */
    public BeneficiaryConfirmationRecord(Long sessionId,Long versionId,String scopeHash,Long beneficiaryId,
            Long actorId,LocalDateTime at,String reference) {
        this.sessionId=sessionId; this.versionId=versionId; this.scopeHash=scopeHash;
        this.beneficiaryId=beneficiaryId; this.actorId=actorId; this.confirmedAt=at; this.reference=reference;
    }
    public Long getId(){return id;} public UUID getPublicId(){return publicId;}
    public Long getBeneficiaryId(){return beneficiaryId;} public Long getActorId(){return actorId;}
    public LocalDateTime getConfirmedAt(){return confirmedAt;} public String getReference(){return reference;}
}
