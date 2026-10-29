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
 */
@Entity
@Table(name = "distribution_workflow_events", schema = "dbo")
public class DistributionWorkflowEvent {

    public static final String REQUEST_DOCUMENTS = "REQUEST_DOCUMENTS";
    public static final String APPROVE_DOCUMENTS = "APPROVE_DOCUMENTS";
    public static final String REQUEST_DOCUMENT_SUPPLEMENTATION = "REQUEST_DOCUMENT_SUPPLEMENTATION";
    public static final String SUBMIT_ALLOCATIONS = "SUBMIT_ALLOCATIONS";
    public static final String APPROVE_ALLOCATIONS = "APPROVE_ALLOCATIONS";
    public static final String REQUEST_ALLOCATION_CHANGES = "REQUEST_ALLOCATION_CHANGES";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private UUID publicId;

    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    @Column(name = "event_no", nullable = false, updatable = false)
    private int eventNo;

    @Column(name = "action", nullable = false, updatable = false, length = 40)
    private String action;

    @Column(name = "actor_user_id", nullable = false, updatable = false)
    private Long actorUserId;

    @Column(name = "reason", updatable = false, length = 1000)
    private String reason;

    @Column(name = "document_version", updatable = false)
    private Integer documentVersion;

    @Column(name = "document_sha256", updatable = false, length = 64)
    private String documentSha256;

    @Column(name = "allocation_version", updatable = false)
    private Integer allocationVersion;

    @Column(name = "allocation_sha256", updatable = false, length = 64)
    private String allocationSha256;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected DistributionWorkflowEvent() {
    }

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
}
