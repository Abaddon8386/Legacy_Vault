package com.legacyvault.verification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Phiên bàn giao tại quầy của một ca xác minh.
 * <p>
 * Bảng {@code dbo.handover_sessions}. Một phiên do Staff mở ({@code HandoverSessionService}) với trạng thái {@link HandoverSessionStatus#OPEN}
 * và kết thúc bằng {@code COMPLETED} (qua {@code HandoverCloseService}) hoặc {@code CANCELLED}, qua phương thức {@link #close}. Các thực thể
 * con gồm {@link HandoverItem}, {@link HandoverReceipt}, {@link BeneficiaryConfirmationRecord}, {@link HandoverCompletionEvidence}.
 */
@Entity
@Table(name = "handover_sessions", schema = "dbo")
public class HandoverSession {
    /**
     * Khóa chính nội bộ {@code handover_session_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "handover_session_id")
    private Long id;

    /**
     * Mã công khai (UUID).
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id ca xác minh ({@code verification_cases}).
     */
    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    /**
     * Id Staff phụ trách phiên.
     */
    @Column(name = "staff_user_id", nullable = false, updatable = false)
    private Long staffUserId;

    /**
     * Trạng thái phiên: OPEN, COMPLETED hoặc CANCELLED (lưu dạng chữ).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private HandoverSessionStatus status;

    /**
     * Thời điểm mở phiên (UTC).
     */
    @Column(name = "opened_at", nullable = false, updatable = false)
    private LocalDateTime openedAt;

    /**
     * Thời điểm đóng phiên (null khi còn OPEN).
     */
    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    /**
     * Thời điểm cập nhật gần nhất (UTC).
     */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected HandoverSession() {}

    /**
     * Tạo phiên mới ở trạng thái OPEN.
     * @param verificationCaseId id ca xác minh
     * @param staffUserId        id Staff phụ trách
     */
    public HandoverSession(Long verificationCaseId, Long staffUserId) {
        this.verificationCaseId = verificationCaseId;
        this.staffUserId = staffUserId;
        this.status = HandoverSessionStatus.OPEN;
    }

    /**
     * Trước khi lưu: sinh {@code publicId}, đặt trạng thái OPEN và các mốc {@code openedAt}/{@code updatedAt} nếu chưa có.
     */
    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (publicId == null) publicId = UUID.randomUUID();
        if (status == null) status = HandoverSessionStatus.OPEN;
        if (openedAt == null) openedAt = now;
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
     * Đóng phiên với trạng thái kết thúc.
     * @param terminalStatus {@code COMPLETED} hoặc {@code CANCELLED}
     * @param now            thời điểm đóng (UTC), ghi vào {@code closedAt} và {@code updatedAt}
     * @throws IllegalStateException nếu phiên không còn OPEN hoặc trạng thái đích không hợp lệ
     */
    public void close(HandoverSessionStatus terminalStatus, LocalDateTime now) {
        if (status != HandoverSessionStatus.OPEN
                || (terminalStatus != HandoverSessionStatus.COMPLETED
                && terminalStatus != HandoverSessionStatus.CANCELLED)) {
            throw new IllegalStateException("Invalid handover session transition");
        }
        status = terminalStatus;
        closedAt = now;
        updatedAt = now;
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Long getVerificationCaseId() { return verificationCaseId; }
    public Long getStaffUserId() { return staffUserId; }
    public HandoverSessionStatus getStatus() { return status; }
    public LocalDateTime getOpenedAt() { return openedAt; }
    public LocalDateTime getClosedAt() { return closedAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
