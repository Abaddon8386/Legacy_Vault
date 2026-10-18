package com.legacyvault.verification.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/** Append-only Legal assessment bound to an immutable dossier version and its court metadata. */
@Entity
@Table(name = "court_decisions", schema = "dbo")
public class CourtDecision {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "court_decision_id")
    private Long id;
    @Column(name = "public_id", nullable = false, updatable = false)
    private UUID publicId;
    @Column(name = "dossier_version_id", nullable = false, updatable = false)
    private Long dossierVersionId;
    @Column(name = "result", nullable = false, updatable = false, length = 20)
    private String result;
    @Column(name = "reason", nullable = false, updatable = false, length = 1000)
    private String reason;
    @Column(name = "reviewed_by_user_id", nullable = false, updatable = false)
    private Long reviewedByUserId;
    @Column(name = "reviewed_at", nullable = false, updatable = false)
    private LocalDateTime reviewedAt;

    protected CourtDecision() { }
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
