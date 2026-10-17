package com.legacyvault.verification.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "legal_verifications", schema = "dbo")
public class LegalVerification {

    public static final String RESULT_PENDING = "PENDING";
    public static final String RESULT_APPROVED = "APPROVED";
    public static final String RESULT_REJECTED = "REJECTED";
    public static final String RESULT_NEEDS_CORRECTION = "NEEDS_CORRECTION";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "verification_id")
    private Long verificationId;

    @Column(name = "legal_document_id")
    private Long legalDocumentId;

    @Column(name = "death_document_record_id")
    private Long deathDocumentRecordId;

    @Column(name = "asset_version_id")
    private Long assetVersionId;

    @Column(name = "verifier_user_id")
    private Long verifierUserId;

    @Column(name = "result", nullable = false, length = 30)
    private String result;

    @Column(name = "remarks", length = 1000)
    private String remarks;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected LegalVerification() {
    }

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