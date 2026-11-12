package com.legacyvault.verification.entity;

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
 * One append-only step of the distribution workflow (document request, document assessment, allocation review).
 * The current phase is derived from the events of a case; an event never moves a vault by itself.
 * <p>
 * Bảng {@code dbo.distribution_workflow_events}: nhật ký chỉ-thêm các bước của luồng phân chia (yêu cầu giấy tờ, thẩm định giấy tờ,
 * duyệt phân bổ) của một ca xác minh. Giai đoạn hiện tại được suy ra từ chuỗi sự kiện theo {@code event_no}. Do
 * {@code DistributionWorkflowService} ghi và {@code BasisDossierViewService} đọc.
 */
@Entity
@Table(name = "distribution_workflow_events", schema = "dbo")
public class DistributionWorkflowEvent {

    /**
     * Hành động: yêu cầu giấy tờ.
     */
    public static final String REQUEST_DOCUMENTS = "REQUEST_DOCUMENTS";
    /**
     * Hành động: duyệt giấy tờ.
     */
    public static final String APPROVE_DOCUMENTS = "APPROVE_DOCUMENTS";
    /**
     * Hành động: yêu cầu bổ sung giấy tờ.
     */
    public static final String REQUEST_DOCUMENT_SUPPLEMENTATION = "REQUEST_DOCUMENT_SUPPLEMENTATION";
    /**
     * Hành động: nộp bảng phân bổ.
     */
    public static final String SUBMIT_ALLOCATIONS = "SUBMIT_ALLOCATIONS";
    /**
     * Hành động: duyệt bảng phân bổ.
     */
    public static final String APPROVE_ALLOCATIONS = "APPROVE_ALLOCATIONS";
    /**
     * Hành động: yêu cầu sửa bảng phân bổ.
     */
    public static final String REQUEST_ALLOCATION_CHANGES = "REQUEST_ALLOCATION_CHANGES";

    /**
     * Khóa chính nội bộ {@code event_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long id;

    /**
     * Mã công khai (UUID) của sự kiện.
     */
    @Column(name = "public_id", nullable = false, updatable = false)
    private UUID publicId;

    /**
     * Id ca xác minh chứa sự kiện.
     */
    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    /**
     * Số thứ tự sự kiện trong ca (tăng dần).
     */
    @Column(name = "event_no", nullable = false, updatable = false)
    private int eventNo;

    /**
     * Mã hành động, một trong các hằng số của lớp này.
     */
    @Column(name = "action", nullable = false, updatable = false, length = 40)
    private String action;

    /**
     * Id người thực hiện (Staff hoặc Legal tùy hành động).
     */
    @Column(name = "actor_user_id", nullable = false, updatable = false)
    private Long actorUserId;

    /**
     * Lý do/ghi chú (tùy chọn, tối đa 1000 ký tự).
     */
    @Column(name = "reason", updatable = false, length = 1000)
    private String reason;

    /**
     * Số phiên bản văn bản căn cứ liên quan (nếu có).
     */
    @Column(name = "document_version", updatable = false)
    private Integer documentVersion;

    /**
     * SHA-256 của phiên bản văn bản căn cứ liên quan.
     */
    @Column(name = "document_sha256", updatable = false, length = 64)
    private String documentSha256;

    /**
     * Số phiên bản bảng phân bổ liên quan (nếu có).
     */
    @Column(name = "allocation_version", updatable = false)
    private Integer allocationVersion;

    /**
     * SHA-256 của bảng phân bổ liên quan.
     */
    @Column(name = "allocation_sha256", updatable = false, length = 64)
    private String allocationSha256;

    /**
     * Thời điểm tạo sự kiện (UTC), đặt tự động khi lưu.
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected DistributionWorkflowEvent() {
    }

    /**
     * Tạo sự kiện mới và sinh {@code publicId}.
     * @param verificationCaseId id ca xác minh
     * @param eventNo            số thứ tự sự kiện trong ca
     * @param action             mã hành động
     * @param actorUserId        id người thực hiện
     * @param reason             lý do
     * @param documentVersion    phiên bản văn bản liên quan
     * @param documentSha256     hash văn bản
     * @param allocationVersion  phiên bản phân bổ liên quan
     * @param allocationSha256   hash phân bổ
     */
    public DistributionWorkflowEvent(Long verificationCaseId, int eventNo, String action, Long actorUserId, String reason,
            Integer documentVersion, String documentSha256, Integer allocationVersion, String allocationSha256) {
        this.publicId = UUID.randomUUID();
        this.verificationCaseId = verificationCaseId;
        this.eventNo = eventNo;
        this.action = action;
        this.actorUserId = actorUserId;
        this.reason = reason;
        this.documentVersion = documentVersion;
        this.documentSha256 = documentSha256;
        this.allocationVersion = allocationVersion;
        this.allocationSha256 = allocationSha256;
    }

    /**
     * Đặt {@code createdAt} là thời điểm hiện tại (UTC) trước khi lưu.
     */
    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public int getEventNo() { return eventNo; }
    public String getAction() { return action; }
    public String getReason() { return reason; }
    public Integer getDocumentVersion() { return documentVersion; }
    public String getDocumentSha256() { return documentSha256; }
    public Integer getAllocationVersion() { return allocationVersion; }
    public String getAllocationSha256() { return allocationSha256; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
