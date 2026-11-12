package com.legacyvault.verification.dto;

import com.legacyvault.verification.entity.DeathDocumentRecord;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Metadata đã ghi nhận. {@code receivedBy} là ID công khai của Staff, không phải khóa nội bộ.
 *
 * Kết quả của {@code POST/GET /api/v1/staff/verification-cases/{caseId}/death-documents}.
 *
 * Các trường:
 * - {@code id}, {@code caseId}: UUID công khai.
 * - {@code documentType}, {@code issuingAuthority}, {@code documentNumber}, {@code issuedDate}: thông tin giấy tờ.
 * - {@code receivedBy}, {@code receivedAt}: Staff nhận và thời điểm nhận (UTC).
 * - {@code evidenceReference}, {@code notes}: chứng cứ và ghi chú.
 * - {@code notification}: biên nhận thông báo workflow (có thể null).
 * - {@code legalDecision}: quyết định thẩm định của Legal nếu đã có.
 */
public record DeathDocumentRecordResponse(UUID id,
        UUID caseId,
        String documentType,
        String issuingAuthority,
        String documentNumber,
        LocalDate issuedDate,
        UUID receivedBy,
        Instant receivedAt,
        String evidenceReference,
        String notes, com.legacyvault.notification.WorkflowNotificationService.Receipt notification,
        LegalDecision legalDecision) {
    /**
     * Quyết định thẩm định của Legal gắn kèm giấy tờ.
     */
    public record LegalDecision(String result, String reason, Instant decidedAt) { }
    /**
     * Constructor không có {@code legalDecision} (đặt null).
     */
    public DeathDocumentRecordResponse(UUID id, UUID caseId, String documentType, String issuingAuthority,
            String documentNumber, LocalDate issuedDate, UUID receivedBy, Instant receivedAt,
            String evidenceReference, String notes, com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
        this(id, caseId, documentType, issuingAuthority, documentNumber, issuedDate, receivedBy, receivedAt,
                evidenceReference, notes, notification, null);
    }
    /**
     * Constructor tối giản: không có {@code notification} và {@code legalDecision}.
     */
    public DeathDocumentRecordResponse(UUID id,
        UUID caseId,
        String documentType,
        String issuingAuthority,
        String documentNumber,
        LocalDate issuedDate,
        UUID receivedBy,
        Instant receivedAt,
        String evidenceReference,
        String notes) { this(id, caseId, documentType, issuingAuthority, documentNumber, issuedDate, receivedBy, receivedAt, evidenceReference, notes, null); }
    /**
     * Trả bản sao có gắn biên nhận thông báo.
     */
    public DeathDocumentRecordResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new DeathDocumentRecordResponse(id, caseId, documentType, issuingAuthority, documentNumber, issuedDate, receivedBy, receivedAt, evidenceReference, notes, receipt, legalDecision); }
    /**
     * Trả bản sao có gắn quyết định Legal {@code decision}.
     */
    public DeathDocumentRecordResponse withLegalDecision(LegalDecision decision) {
        return new DeathDocumentRecordResponse(id, caseId, documentType, issuingAuthority, documentNumber, issuedDate,
                receivedBy, receivedAt, evidenceReference, notes, notification, decision);
    }

    /**
     * Dựng response từ entity {@code DeathDocumentRecord}; thời gian nhận đổi sang UTC.
     *
     * @param record           entity giấy tờ
     * @param casePublicId    UUID công khai của ca
     * @param receivedByPublicId UUID công khai của Staff nhận
     */
    public static DeathDocumentRecordResponse from(
            DeathDocumentRecord record,
            UUID casePublicId,
            UUID receivedByPublicId
    ) {
        return new DeathDocumentRecordResponse(
                record.getPublicId(),
                casePublicId,
                record.getDocumentType(),
                record.getIssuingAuthority(),
                record.getDocumentNumber(),
                record.getIssuedDate(),
                receivedByPublicId,
                record.getReceivedAt().toInstant(ZoneOffset.UTC),
                record.getEvidenceReference(),
                record.getNotes()
        );
    }
}
