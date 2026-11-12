package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Encrypted, transactional handoff payload for the disabled-by-default PS-106 mail transport.
 *
 * Thực thể ánh xạ bảng {@code dbo.beneficiary_invitation_mail_outbox}: hàng đợi gửi email mời (outbox pattern). Nội dung (email người nhận
 * và mã mời thô) được mã hóa AES-GCM; trạng thái vận chuyển mặc định {@code QUEUED} và dịch vụ gửi mail hiện đang tắt. Được tạo bởi
 * {@code InvitationMailOutboxService.enqueue} trong cùng giao dịch với việc cấp mã.
 */
@Entity
@Table(name = "beneficiary_invitation_mail_outbox", schema = "dbo")
public class BeneficiaryInvitationOutbox {
    /**
     * Trạng thái vận chuyển ban đầu: đã xếp hàng chờ gửi.
     */
    public static final String QUEUED = "QUEUED";

    /**
     * Khóa chính nội bộ (cột {@code outbox_id}).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "outbox_id")
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id nội bộ của người thụ hưởng nhận mail.
     */
    @Column(name = "beneficiary_id", nullable = false, updatable = false)
    private Long beneficiaryId;

    /**
     * Id lời mời liên quan (duy nhất, mỗi lời mời một dòng outbox).
     */
    @Column(name = "invitation_id", nullable = false, unique = true, updatable = false)
    private Long invitationId;

    @Column(name = "invitation_public_id", nullable = false, updatable = false)
    private UUID invitationPublicId;

    /**
     * Thế hệ "kỳ vọng" mà Staff gửi lên ({@code expectedGeneration}); cùng {@code beneficiaryId} dùng để chống yêu cầu trùng.
     */
    @Column(name = "request_generation", nullable = false, updatable = false)
    private int requestGeneration;

    /**
     * Thế hệ thực của lời mời được tạo.
     */
    @Column(name = "invitation_generation", nullable = false, updatable = false)
    private int invitationGeneration;

    /**
     * Bản mã của payload JSON (email và mã mời).
     */
    @Column(name = "payload_ciphertext", nullable = false, columnDefinition = "varbinary(max)", updatable = false)
    private byte[] payloadCiphertext;

    /**
     * Vector khởi tạo AES-GCM 12 byte.
     */
    @Column(name = "payload_iv", nullable = false, columnDefinition = "varbinary(12)", updatable = false)
    private byte[] payloadIv;

    /**
     * Phiên bản khóa mã hóa đã dùng.
     */
    @Column(name = "key_version", nullable = false, length = 32, updatable = false)
    private String keyVersion;

    /**
     * Trạng thái vận chuyển ({@code QUEUED} ...).
     */
    @Column(name = "transport_status", nullable = false, length = 20)
    private String transportStatus = QUEUED;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Hàm khởi tạo mặc định cho JPA.
     */
    protected BeneficiaryInvitationOutbox() { }

    /**
     * Tạo dòng outbox mới; sao chép mảng byte để tránh bị sửa từ bên ngoài.
     */
    public BeneficiaryInvitationOutbox(UUID publicId, Long beneficiaryId, Long invitationId, UUID invitationPublicId,
            int requestGeneration,
            int invitationGeneration, byte[] payloadCiphertext, byte[] payloadIv, String keyVersion) {
        this.publicId = publicId;
        this.beneficiaryId = beneficiaryId;
        this.invitationId = invitationId;
        this.invitationPublicId = invitationPublicId;
        this.requestGeneration = requestGeneration;
        this.invitationGeneration = invitationGeneration;
        this.payloadCiphertext = payloadCiphertext.clone();
        this.payloadIv = payloadIv.clone();
        this.keyVersion = keyVersion;
    }

    /**
     * Callback JPA trước khi INSERT: điền {@code createdAt} (UTC).
     */
    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Long getBeneficiaryId() { return beneficiaryId; }
    public Long getInvitationId() { return invitationId; }
    public UUID getInvitationPublicId() { return invitationPublicId; }
    public int getRequestGeneration() { return requestGeneration; }
    public int getInvitationGeneration() { return invitationGeneration; }
    public String getTransportStatus() { return transportStatus; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    /**
     * Che payload đã mã hóa khi in log.
     */
    @Override public String toString() {
        return "BeneficiaryInvitationOutbox[publicId=" + publicId + ", transportStatus=" + transportStatus
                + ", payload=<encrypted>]";
    }
}
