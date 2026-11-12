package com.legacyvault.verification.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Append-only Legal assessment bound to an immutable dossier version and its court metadata.
 * <p>
 * Bảng {@code dbo.court_decisions}: kết quả đánh giá của Legal Verifier cho nhánh hồ sơ COURT. Chỉ thêm mới, không sửa/xóa.
 * Do {@code CourtDecisionService} tạo và {@code LegalReadService} đọc.
 */
@Entity
@Table(name = "court_decisions", schema = "dbo")
public class CourtDecision {
    /**
     * Khóa chính nội bộ {@code court_decision_id} (IDENTITY).
     */
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "court_decision_id")
    private Long id;
    /**
     * Mã công khai (UUID) của quyết định.
     */
    @Column(name = "public_id", nullable = false, updatable = false)
    private UUID publicId;
    /**
     * Id phiên bản hồ sơ căn cứ ({@code legal_basis_dossier_versions}) được đánh giá.
     */
    @Column(name = "dossier_version_id", nullable = false, updatable = false)
    private Long dossierVersionId;
    /**
     * Kết quả đánh giá (chuỗi tối đa 20 ký tự). {@code CourtDecisionService} ghi tên của enum
     * {@code CourtDecisionRequest.Result}: {@code VALID} (hợp lệ), {@code INVALID} (không hợp lệ) hoặc
     * {@code INCONCLUSIVE} (chưa kết luận được).
     */
    @Column(name = "result", nullable = false, updatable = false, length = 20)
    private String result;
    /**
     * Lý do/nhận xét của Legal (tối đa 1000 ký tự).
     */
    @Column(name = "reason", nullable = false, updatable = false, length = 1000)
    private String reason;
    /**
     * Id Legal Verifier đánh giá.
     */
    @Column(name = "reviewed_by_user_id", nullable = false, updatable = false)
    private Long reviewedByUserId;
    /**
     * Thời điểm đánh giá (UTC).
     */
    @Column(name = "reviewed_at", nullable = false, updatable = false)
    private LocalDateTime reviewedAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected CourtDecision() { }
    /**
     * Tạo quyết định mới: sinh {@code publicId} và đặt {@code reviewedAt} là thời điểm hiện tại (UTC).
     * @param versionId id phiên bản hồ sơ căn cứ
     * @param result    kết quả đánh giá
     * @param reason    lý do
     * @param reviewer  id Legal Verifier
     */
    public CourtDecision(Long versionId, String result, String reason, Long reviewer) {
        publicId = UUID.randomUUID();
        dossierVersionId = versionId;
        this.result = result;
        this.reason = reason;
        reviewedByUserId = reviewer;
        reviewedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Long getDossierVersionId() { return dossierVersionId; }
    public String getResult() { return result; }
    public String getReason() { return reason; }
    public Long getReviewedByUserId() { return reviewedByUserId; }
    public LocalDateTime getReviewedAt() { return reviewedAt; }
}
