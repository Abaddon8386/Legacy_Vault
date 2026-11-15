
package com.legacyvault.vault.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

/**
 * Quản lý Vault và các trạng thái xử lý nghiệp vụ.
 *
 * Gói: com.legacyvault.vault.entity
 */
@Entity
@Table(
        name = "vaults",
        uniqueConstraints = @UniqueConstraint(
                name = "UQ_vaults_owner_user_id",
                columnNames = "owner_user_id"))
public class Vault {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "vault_id")
    private Long vaultId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "owner_user_id", nullable = false, updatable = false)
    private Long ownerUserId;

    @Column(name = "vault_name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "nvarchar(max)")
    private String description;

    @Column(name = "status", nullable = false, length = 40)
    private String status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Vault() {
    }

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (publicId == null) publicId = UUID.randomUUID();
        if (status == null) status = STATUS_ACTIVE;
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_ARCHIVED = "ARCHIVED";

    /**
     * HANDOVER_IN_PROGRESS sang ARCHIVED sau khi bàn giao hoàn tất.
     */
    public void archiveAfterHandover() {
        moveTo(STATUS_HANDOVER_IN_PROGRESS, STATUS_ARCHIVED);
    }
    // Chuỗi trạng thái hậu sự: ACTIVE, AWAITING_VERIFICATION, DOCUMENT_VERIFICATION, WILL_VERIFICATION, (ON_HOLD hoặc AWAITING_LEGAL_BASIS), LEGAL_BASIS_VERIFICATION, UNLOCKED, HANDOVER_IN_PROGRESS, ARCHIVED.
    public static final String STATUS_AWAITING_VERIFICATION = "AWAITING_VERIFICATION";
    public static final String STATUS_DOCUMENT_VERIFICATION = "DOCUMENT_VERIFICATION";
    public static final String STATUS_WILL_VERIFICATION = "WILL_VERIFICATION";
    public static final String STATUS_AWAITING_LEGAL_BASIS = "AWAITING_LEGAL_BASIS";
    public static final String STATUS_ON_HOLD = "ON_HOLD";
    public static final String STATUS_LEGAL_BASIS_VERIFICATION = "LEGAL_BASIS_VERIFICATION";
    public static final String STATUS_UNLOCKED = "UNLOCKED";
    public static final String STATUS_HANDOVER_IN_PROGRESS = "HANDOVER_IN_PROGRESS";

    /** PS-59: chỉ workflow Legal được bảo vệ mới được chuyển Vault sang UNLOCKED. */
    public void unlockAfterLegalApproval() {
        if (!STATUS_LEGAL_BASIS_VERIFICATION.equals(status)) {
            throw new IllegalStateException("Vault is not in legal-basis verification");
        }
        status = STATUS_UNLOCKED;
        updatedAt = Instant.now();
    }

    /** PS-65 / ST-25: lần giao đầu tiên tại quầy chuyển UNLOCKED -> HANDOVER_IN_PROGRESS; các lần giao sau giữ nguyên. */
    public void markHandoverInProgress() {
        if (STATUS_HANDOVER_IN_PROGRESS.equals(status)) {
            return;
        }
        if (!STATUS_UNLOCKED.equals(status)) {
            throw new IllegalStateException("Vault must be UNLOCKED to start handover");
        }
        status = STATUS_HANDOVER_IN_PROGRESS;
        updatedAt = Instant.now();
    }

    /**
     * Đưa Vault về ACTIVE (VaultService#cancelAlert dùng khi chủ Vault hủy cảnh báo). Không tự kiểm tra trạng thái hiện tại; nơi gọi chịu trách nhiệm về điều kiện.
     */
    public void restoreActive() {
        this.status = STATUS_ACTIVE;
        this.updatedAt = Instant.now();
    }

    /**
     * AWAITING_VERIFICATION sang DOCUMENT_VERIFICATION khi bắt đầu xác minh giấy tờ tử vong.
     *
     * @throws IllegalStateException nếu Vault không ở AWAITING_VERIFICATION
     */
    public void markDocumentVerification() {
        if (!STATUS_AWAITING_VERIFICATION.equals(this.status)) {
            throw new IllegalStateException(
                    "Vault is not awaiting death-document verification");
        }

        this.status = STATUS_DOCUMENT_VERIFICATION;
        this.updatedAt = Instant.now();
    }

    /** ST-15: DOCUMENT_VERIFICATION -> WILL_VERIFICATION. */
    public void markWillVerification() {
        moveTo(STATUS_DOCUMENT_VERIFICATION, STATUS_WILL_VERIFICATION);
    }

    /**
     * ST-16: WILL_VERIFICATION -> AWAITING_LEGAL_BASIS hoặc ON_HOLD.
     */
    public void markLegalBasisRouted(boolean onHold) {
        if (!STATUS_DOCUMENT_VERIFICATION.equals(status) && !STATUS_WILL_VERIFICATION.equals(status))
            throw new IllegalStateException("Death verification must precede court classification");
        status = onHold ? STATUS_ON_HOLD : STATUS_AWAITING_LEGAL_BASIS;
        updatedAt = Instant.now();
    }

    /** ON_HOLD -> AWAITING_LEGAL_BASIS sau khi Legal phân loại lại. */
    public void markAwaitingLegalBasisAfterHold() {
        moveTo(STATUS_ON_HOLD, STATUS_AWAITING_LEGAL_BASIS);
    }

    /** Legal mở lại review khi có tranh chấp/thiếu chứng cứ mới; việc này không bao giờ mở khóa Vault. */
    public void holdLegalBasisReview() {
        if (!STATUS_AWAITING_LEGAL_BASIS.equals(status) && !STATUS_LEGAL_BASIS_VERIFICATION.equals(status))
            throw new IllegalStateException("Vault is not in the legal-basis workflow");
        status = STATUS_ON_HOLD;
        updatedAt = Instant.now();
    }

    /** ST-19/20: Staff chuyển văn bản đúng nhánh cho Legal. AWAITING_LEGAL_BASIS -> LEGAL_BASIS_VERIFICATION. */
    public void markLegalBasisVerification() {
        if (!isLegalBasisIntakeState()) {
            throw new IllegalStateException(
                    "Vault must be DOCUMENT_VERIFICATION, WILL_VERIFICATION or AWAITING_LEGAL_BASIS to move to "
                            + STATUS_LEGAL_BASIS_VERIFICATION);
        }
        status = STATUS_LEGAL_BASIS_VERIFICATION;
        updatedAt = Instant.now();
    }

    /**
     * Các trạng thái mà Staff có thể nhận và chuyển tiếp văn bản phân chia. Tất cả đều đứng sau khi Legal đã quyết định
     * giấy tờ tử vong, nên không thể bỏ qua xác minh tử vong; AWAITING_VERIFICATION không nằm trong đó.
     */
    public boolean isLegalBasisIntakeState() {
        return STATUS_DOCUMENT_VERIFICATION.equals(status) || STATUS_WILL_VERIFICATION.equals(status)
                || STATUS_AWAITING_LEGAL_BASIS.equals(status);
    }

    /**
     * PS-37 / ST-20:
     * Legal yêu cầu Staff bổ sung chứng cứ sau khi review.
     *
     * LEGAL_BASIS_VERIFICATION -> AWAITING_LEGAL_BASIS.
     */
    public void markAwaitingLegalBasisAfterReviewHold() {
        moveTo(
                STATUS_LEGAL_BASIS_VERIFICATION,
                STATUS_AWAITING_LEGAL_BASIS);
    }

    /**
     * Chuyển trạng thái có kiểm tra: chỉ khi trạng thái hiện tại đúng {@code expectedFrom}, ngược lại ném IllegalStateException.
     */
    private void moveTo(String expectedFrom, String to) {
        if (!expectedFrom.equals(this.status)) {
            throw new IllegalStateException(
                    "Vault must be " + expectedFrom + " to move to " + to);
        }

        this.status = to;
        this.updatedAt = Instant.now();
    }

    /**
     * Chỉ Vault ACTIVE mới được chuyển sang quy trình xác minh.
     */
    public boolean canEnterVerification() {
        return STATUS_ACTIVE.equals(status);
    }

    /**
     * ACTIVE sang AWAITING_VERIFICATION (DMS gọi khi hết Grace Period, ST-09).
     *
     * @throws IllegalStateException nếu Vault không ở ACTIVE
     */
    public void markAwaitingVerification() {
        if (!canEnterVerification()) {
            throw new IllegalStateException(
                    "Vault is not eligible for verification transition");
        }

        this.status = STATUS_AWAITING_VERIFICATION;
        this.updatedAt = Instant.now();
    }

    public Long getVaultId() {
        return vaultId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(Long ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

}
