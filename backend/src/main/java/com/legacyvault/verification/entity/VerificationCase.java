package com.legacyvault.verification.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Ca xác minh di sản của một kho (vault) sau khi chủ kho qua đời hoặc được kích hoạt.
 * <p>
 * Bảng {@code dbo.verification_cases}. Trạng thái: {@link #STATUS_OPEN} (đang xử lý), {@link #STATUS_CLOSED} (đã hoàn tất bàn giao) hoặc
 * {@link #STATUS_CANCELLED} (đã hủy). Ca được mở (hiện do {@code DmsTriggerProcessor} tạo khi DMS kích hoạt, {@code openedByUserId} null) và giao cho một Staff
 * ({@code assigned_staff_user_id}); các thực thể con gồm {@link DeathDocumentRecord}, {@link OriginalWillIntake}, {@link WillComparison},
 * {@link LegalBasisDossier}, {@link HandoverSession}, {@link DistributionWorkflowEvent}. Dùng bởi hầu hết service trong gói verification.
 */
@Entity
@Table(name = "verification_cases", schema = "dbo")
public class VerificationCase {

    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_CLOSED = "CLOSED";

    /**
     * Id phiên bàn giao đã hoàn tất làm đóng ca (null khi ca chưa đóng bằng bàn giao).
     */
    @Column(name = "closed_handover_session_id")
    private Long closedHandoverSessionId;

    /**
     * @return id phiên bàn giao đã đóng ca
     */
    public Long getClosedHandoverSessionId() { return closedHandoverSessionId; }

    /**
     * Đóng ca sau khi phiên bàn giao hoàn tất: đặt trạng thái CLOSED, {@code closedAt}, {@code updatedAt} và {@code closedHandoverSessionId}.
     * @param now               thời điểm đóng (UTC)
     * @param handoverSessionId id phiên bàn giao hoàn tất (không được null)
     * @throws IllegalStateException nếu ca không còn OPEN
     * @throws NullPointerException  nếu {@code handoverSessionId} null
     */
    public void complete(LocalDateTime now, Long handoverSessionId) {
        if (!isOpen()) throw new IllegalStateException("Verification case is not open");
        java.util.Objects.requireNonNull(handoverSessionId, "handoverSessionId");
        status = STATUS_CLOSED;
        closedAt = now;
        updatedAt = now;
        closedHandoverSessionId = handoverSessionId;
    }
    /**
     * Trạng thái đã hủy.
     */
    public static final String STATUS_CANCELLED = "CANCELLED";

    /**
     * Khóa chính nội bộ {@code verification_case_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "verification_case_id")
    private Long verificationCaseId;

    /**
     * Mã công khai (UUID) dùng làm khóa ở API.
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id kho ({@code vaults}) được xác minh.
     */
    @Column(name = "vault_id", nullable = false)
    private Long vaultId;

    /**
     * Trạng thái ca: OPEN, CLOSED hoặc CANCELLED.
     */
    @Column(name = "status", nullable = false, length = 30)
    private String status;

    /**
     * Thời điểm sự kiện kích hoạt ca (UTC).
     */
    @Column(name = "triggered_at", nullable = false)
    private LocalDateTime triggeredAt;

    /**
     * Id Staff được giao xử lý (null khi chưa giao).
     */
    @Column(name = "assigned_staff_user_id")
    private Long assignedStaffUserId;

    /**
     * Id người mở ca (có thể null nếu hệ thống tự mở).
     */
    @Column(name = "opened_by_user_id")
    private Long openedByUserId;

    /**
     * Thời điểm mở ca (UTC).
     */
    @Column(name = "opened_at", nullable = false)
    private LocalDateTime openedAt;

    /**
     * Thời điểm đóng hoặc hủy ca (UTC).
     */
    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    /**
     * Thời điểm tạo bản ghi (UTC); cùng {@code verification_case_id} dùng sinh mã hiển thị.
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Thời điểm cập nhật gần nhất (UTC).
     */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected VerificationCase() {
    }

    /**
     * Tạo ca mới ở trạng thái OPEN.
     * @param vaultId        id kho
     * @param triggeredAt    thời điểm kích hoạt
     * @param openedByUserId id người mở ca
     */
    public VerificationCase(
            Long vaultId,
            LocalDateTime triggeredAt,
            Long openedByUserId
    ) {
        this.vaultId = vaultId;
        this.triggeredAt = triggeredAt;
        this.openedByUserId = openedByUserId;
        this.status = STATUS_OPEN;
    }

    /**
     * Trước khi lưu: sinh {@code publicId}, trạng thái OPEN mặc định và các mốc thời gian (UTC) nếu chưa có.
     */
    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (publicId == null) publicId = UUID.randomUUID();
        if (status == null) status = STATUS_OPEN;
        if (openedAt == null) openedAt = now;
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    /**
     * Trước khi cập nhật: làm mới {@code updatedAt} (UTC).
     */
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /**
     * @return true nếu trạng thái là OPEN
     */
    public boolean isOpen() {
        return STATUS_OPEN.equals(status);
    }

    /**
     * Hủy ca: đặt CANCELLED, {@code closedAt} và {@code updatedAt}.
     * @param now thời điểm hủy (UTC)
     * @throws IllegalStateException nếu ca không còn OPEN
     */
    public void cancel(LocalDateTime now) {
        if (!isOpen()) {
            throw new IllegalStateException("Verification case is not open");
        }
        this.status = STATUS_CANCELLED;
        this.closedAt = now;
        this.updatedAt = now;
    }

    public Long getVerificationCaseId() {
        return verificationCaseId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    /**
     * Stable display reference from immutable persisted fields; UUID remains the API key.
     * @return mã hiển thị dạng {@code HS-yyyy-nnnnnn} (năm tạo và id ca, 6 chữ số)
     * @throws IllegalStateException nếu ca chưa được lưu (thiếu id hoặc {@code createdAt})
     */
    public String getCaseNumber() {
        if (verificationCaseId == null || createdAt == null) {
            throw new IllegalStateException("Case reference requires a persisted case");
        }
        return String.format(java.util.Locale.ROOT, "HS-%04d-%06d", createdAt.getYear(), verificationCaseId);
    }

    public Long getVaultId() {
        return vaultId;
    }

    public String getStatus() {
        return status;
    }

    public LocalDateTime getTriggeredAt() {
        return triggeredAt;
    }

    public Long getAssignedStaffUserId() {
        return assignedStaffUserId;
    }

    public LocalDateTime getClosedAt() {
        return closedAt;
    }

    public Long getOpenedByUserId() {
        return openedByUserId;
    }

    public LocalDateTime getOpenedAt() {
        return openedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
