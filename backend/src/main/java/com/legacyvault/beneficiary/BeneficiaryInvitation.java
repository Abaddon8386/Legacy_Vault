package com.legacyvault.beneficiary;

import com.legacyvault.auth.EmailNormalizer;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Thực thể ánh xạ bảng {@code dbo.beneficiary_invitations}: mã mời dùng một lần để người thụ hưởng liên kết tài khoản (PS-86/PS-87/PS-106).
 * Chỉ lưu hash SHA-256 của mã (không lưu mã thô). Mỗi người thụ hưởng có nhiều "thế hệ" (generation) mã nhưng chỉ một mã hiện hành
 * ({@code is_current}). Hiệu lực 7 ngày. Được quản lý bởi {@code BeneficiaryInvitationService}.
 */
@Entity
@Table(name = "beneficiary_invitations", schema = "dbo")
public class BeneficiaryInvitation {
    /**
     * Khóa chính nội bộ (cột {@code invitation_id}).
     *
     * Mã công khai của lời mời.
     *
     * Thế hệ của mã (bắt đầu từ 1, tăng khi cấp lại).
     *
     * Cờ mã hiện hành (đảm bảo duy nhất bởi unique index lọc); đặt về false khi cấp mã mới.
     *
     * Hash SHA-256 (hex 64 ký tự) của mã mời, tạo bởi {@code InvitationTokens.hash}.
     *
     * Email gắn với mã (do Staff xác nhận ở PS-106); null với mã Owner cấp (không ràng buộc email).
     *
     * Id người dùng cấp mã (Owner hoặc Staff).
     *
     * Thời điểm thu hồi, null nếu chưa thu hồi.
     *
     * Thời điểm mã được dùng để liên kết tài khoản, null nếu chưa dùng.
     */
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "invitation_id") private Long id;
    @Column(name = "public_id", nullable = false, updatable = false) private UUID publicId;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "beneficiary_id", updatable = false) private Beneficiary beneficiary;
    @Column(nullable = false, updatable = false) private int generation;
    @Column(name = "is_current", nullable = false) private boolean current;
    @Column(name = "code_hash", nullable = false, updatable = false, length = 64) private String codeHash;
    @Column(name = "recipient_email", length = 254) private String recipientEmail;
    @Column(name = "issued_at", nullable = false, updatable = false) private LocalDateTime issuedAt;
    @Column(name = "expires_at", nullable = false, updatable = false) private LocalDateTime expiresAt;
    @Column(name = "issued_by_user_id", nullable = false, updatable = false) private Long issuedBy;
    @Column(name = "revoked_at") private LocalDateTime revokedAt;
    @Column(name = "revoked_by_user_id") private Long revokedBy;
    @Column(name = "consumed_at") private LocalDateTime consumedAt;
    @Column(name = "consumed_by_user_id") private Long consumedBy;

    /**
     * Hàm khởi tạo mặc định cho JPA.
     */
    protected BeneficiaryInvitation() { }
    /**
     * Tạo lời mời không ràng buộc email; hết hạn sau 7 ngày kể từ {@code now}.
     * @param hash hash SHA-256 của mã
     * @param actor id người cấp
     */
    BeneficiaryInvitation(Beneficiary beneficiary, int generation, String hash, Long actor, LocalDateTime now) {
        this.publicId = UUID.randomUUID(); this.beneficiary = beneficiary; this.generation = generation;
        this.current = true; this.codeHash = hash; this.issuedAt = now; this.expiresAt = now.plusDays(7);
        this.issuedBy = actor;
    }
    /**
     * Tạo lời mời có ràng buộc email người nhận (email được chuẩn hóa bằng {@code EmailNormalizer}).
     */
    BeneficiaryInvitation(Beneficiary beneficiary, int generation, String hash, Long actor, LocalDateTime now,
            String recipientEmail) {
        this(beneficiary, generation, hash, actor, now);
        this.recipientEmail = EmailNormalizer.normalize(recipientEmail);
    }
    /**
     * Tính trạng thái hiện tại.
     * @return {@code CONSUMED} nếu đã dùng, {@code REVOKED} nếu đã thu hồi, {@code PENDING} nếu còn hạn, ngược lại {@code EXPIRED}
     */
    public String state(LocalDateTime now) {
        if (consumedAt != null) return "CONSUMED";
        if (revokedAt != null) return "REVOKED";
        return now.isBefore(expiresAt) ? "PENDING" : "EXPIRED";
    }
    /**
     * Đánh dấu thu hồi bởi {@code actor} tại thời điểm {@code now}.
     */
    void revoke(Long actor, LocalDateTime now) { revokedAt = now; revokedBy = actor; }
    /**
     * Bỏ cờ hiện hành để nhường chỗ cho mã thế hệ mới.
     */
    void retire() { current = false; }
    /**
     * Đánh dấu mã đã được tài khoản {@code account} dùng.
     */
    void consume(Long account, LocalDateTime now) { consumedAt = now; consumedBy = account; }
    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Beneficiary getBeneficiary() { return beneficiary; }
    public int getGeneration() { return generation; }
    public boolean isCurrent() { return current; }
    public Long getConsumedBy() { return consumedBy; }
    public LocalDateTime getIssuedAt() { return issuedAt; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public LocalDateTime getRevokedAt() { return revokedAt; }
    public LocalDateTime getConsumedAt() { return consumedAt; }
    public String getRecipientEmail() { return recipientEmail; }
}
