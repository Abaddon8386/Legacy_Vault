package com.legacyvault.verification.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Kết quả xác minh pháp lý của Legal Verifier.
 * <p>
 * Bảng {@code dbo.legal_verifications}. Hiện được dùng cho quyết định về giấy tờ khai tử ({@link DeathDocumentRecord}) qua
 * {@link #createDeathDecision}, do {@code LegalDeathVerificationService} tạo. Kết quả: PENDING, APPROVED, REJECTED, NEEDS_CORRECTION.
 */
@Entity
@Table(name = "legal_verifications", schema = "dbo")
public class LegalVerification {

    /**
     * Chờ quyết định.
     */
    public static final String RESULT_PENDING = "PENDING";
    /**
     * Đã duyệt.
     */
    public static final String RESULT_APPROVED = "APPROVED";
    /**
     * Bị từ chối.
     */
    public static final String RESULT_REJECTED = "REJECTED";
    /**
     * Cần chỉnh sửa/bổ sung.
     */
    public static final String RESULT_NEEDS_CORRECTION = "NEEDS_CORRECTION";

    /**
     * Khóa chính nội bộ {@code verification_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "verification_id")
    private Long verificationId;

    /**
     * Id tài liệu pháp lý được xác minh (không dùng cho quyết định khai tử).
     */
    @Column(name = "legal_document_id")
    private Long legalDocumentId;

    /**
     * Id giấy tờ khai tử được xác minh ({@code death_document_records}).
     */
    @Column(name = "death_document_record_id")
    private Long deathDocumentRecordId;

    /**
     * Id phiên bản tài sản/di chúc được xác minh (không dùng cho quyết định khai tử).
     */
    @Column(name = "asset_version_id")
    private Long assetVersionId;

    /**
     * Id Legal Verifier ra quyết định.
     */
    @Column(name = "verifier_user_id")
    private Long verifierUserId;

    /**
     * Kết quả: một trong các hằng số {@code RESULT_*}.
     */
    @Column(name = "result", nullable = false, length = 30)
    private String result;

    /**
     * Nhận xét/lý do của Legal.
     */
    @Column(name = "remarks", length = 1000)
    private String remarks;

    /**
     * Thời điểm yêu cầu xác minh (UTC).
     */
    @Column(name = "requested_at", nullable = false, updatable = false)
    private LocalDateTime requestedAt;

    /**
     * Thời điểm quyết định (UTC).
     */
    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    /**
     * Thời điểm tạo bản ghi (UTC).
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected LegalVerification() {
    }

    /**
     * Tạo quyết định xác minh giấy tờ khai tử (requestedAt = decidedAt = createdAt = {@code nowUtc}).
     * @param deathDocumentRecordId id giấy tờ khai tử
     * @param verifierUserId        id Legal ra quyết định
     * @param result                APPROVED, REJECTED hoặc NEEDS_CORRECTION
     * @param reason                lý do bắt buộc (được trim)
     * @param nowUtc                thời điểm quyết định (UTC)
     * @return bản ghi mới chưa lưu
     * @throws IllegalArgumentException nếu thiếu dữ liệu, lý do rỗng hoặc kết quả không được hỗ trợ
     */
    public static LegalVerification createDeathDecision(
            Long deathDocumentRecordId,
            Long verifierUserId,
            String result,
            String reason,
            LocalDateTime nowUtc
    ) {
        if (deathDocumentRecordId == null || verifierUserId == null
                || result == null || reason == null || reason.isBlank()
                || nowUtc == null) {
            throw new IllegalArgumentException(
                    "Death verification decision fields are required"
            );
        }

        if (!RESULT_APPROVED.equals(result)
                && !RESULT_REJECTED.equals(result)
                && !RESULT_NEEDS_CORRECTION.equals(result)) {
            throw new IllegalArgumentException(
                    "Unsupported legal verification result"
            );
        }

        LegalVerification verification = new LegalVerification();
        verification.deathDocumentRecordId = deathDocumentRecordId;
        verification.verifierUserId = verifierUserId;
        verification.result = result;
        verification.remarks = reason.trim();
        verification.requestedAt = nowUtc;
        verification.decidedAt = nowUtc;
        verification.createdAt = nowUtc;
        return verification;
    }

    public Long getVerificationId() {
        return verificationId;
    }

    public Long getLegalDocumentId() {
        return legalDocumentId;
    }

    public Long getDeathDocumentRecordId() {
        return deathDocumentRecordId;
    }

    public Long getVerifierUserId() {
        return verifierUserId;
    }

    public String getResult() {
        return result;
    }

    public String getRemarks() {
        return remarks;
    }

    public LocalDateTime getRequestedAt() {
        return requestedAt;
    }

    public LocalDateTime getDecidedAt() {
        return decidedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}