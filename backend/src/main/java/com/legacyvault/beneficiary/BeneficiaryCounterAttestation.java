package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.verification.entity.VerificationCase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Append-only Staff attestation that an in-person document check was performed.
 *
 * Thực thể ánh xạ bảng {@code dbo.beneficiary_counter_attestations}: bản ghi chỉ-thêm (append-only) ghi nhận Staff đã kiểm tra giấy tờ
 * trực tiếp tại quầy cho một người thụ hưởng trong một hồ sơ xác minh (VerificationCase). Được tạo bởi
 * {@code CounterIdentityAttestationService.attest}, được đọc bởi {@code CounterBeneficiaryService} và {@code StaffInvitationEmailService}.
 */
@Entity
@Table(name = "beneficiary_counter_attestations", schema = "dbo")
public class BeneficiaryCounterAttestation {

    /**
     * Khóa chính nội bộ (cột {@code attestation_id}).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "attestation_id")
    private Long id;

    /**
     * Mã công khai của lần chứng thực, trả về là {@code attestationId}.
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Hồ sơ xác minh (case) mà lần chứng thực này thuộc về; không đổi sau khi tạo.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "verification_case_id", nullable = false, updatable = false)
    private VerificationCase verificationCase;

    /**
     * Người thụ hưởng được chứng thực; không đổi sau khi tạo.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "beneficiary_id", nullable = false, updatable = false)
    private Beneficiary beneficiary;

    /**
     * Id của Staff đã thực hiện chứng thực.
     */
    @Column(name = "staff_user_id", nullable = false, updatable = false)
    private Long staffUserId;

    /**
     * Mã tham chiếu bằng chứng (tùy chọn, tối đa 200 ký tự).
     */
    @Column(name = "evidence_reference", length = 200, updatable = false)
    private String evidenceReference;

    /**
     * Email Staff xác nhận tại quầy (đã chuẩn hóa); dùng làm địa chỉ gắn với mã mời PS-106. Có thể null.
     */
    @Column(name = "confirmed_email", length = 254, updatable = false)
    private String confirmedEmail;

    /**
     * Thời điểm chứng thực (UTC).
     */
    @Column(name = "attested_at", nullable = false, updatable = false)
    private LocalDateTime attestedAt;

    /**
     * Hàm khởi tạo mặc định cho JPA.
     */
    protected BeneficiaryCounterAttestation() { }

    /**
     * Tạo bản ghi chứng thực mới (thời điểm và mã công khai được điền ở {@link #onCreate()}).
     */
    public BeneficiaryCounterAttestation(VerificationCase verificationCase, Beneficiary beneficiary,
            Long staffUserId, String evidenceReference, String confirmedEmail) {
        this.verificationCase = verificationCase;
        this.beneficiary = beneficiary;
        this.staffUserId = staffUserId;
        this.evidenceReference = evidenceReference;
        this.confirmedEmail = confirmedEmail;
    }

    /**
     * Callback JPA trước khi INSERT: sinh {@code publicId} và {@code attestedAt} (UTC) nếu còn trống.
     */
    @PrePersist
    void onCreate() {
        if (publicId == null) publicId = UUID.randomUUID();
        if (attestedAt == null) attestedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public VerificationCase getVerificationCase() { return verificationCase; }
    public Beneficiary getBeneficiary() { return beneficiary; }
    public Long getStaffUserId() { return staffUserId; }
    public String getEvidenceReference() { return evidenceReference; }
    public String getConfirmedEmail() { return confirmedEmail; }
    public LocalDateTime getAttestedAt() { return attestedAt; }
}
