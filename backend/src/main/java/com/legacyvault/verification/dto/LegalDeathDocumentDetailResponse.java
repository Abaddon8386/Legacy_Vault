package com.legacyvault.verification.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Kết quả của {@code GET /api/v1/legal-verifications/death-documents/{id}}: giấy tờ, ca, trạng thái ca/vault,
 * {@code document} (metadata) và {@code decisions} (lịch sử quyết định).
 */
public record LegalDeathDocumentDetailResponse(
        UUID deathDocumentPublicId,
        UUID verificationCasePublicId,
        String verificationCaseStatus,
        String vaultStatus,
        DocumentMetadata document,
        List<DecisionHistory> decisions
) {
    /**
     * Metadata giấy tờ: loại, cơ quan cấp, số, ngày cấp, Staff nhận, thời điểm nhận, chứng cứ, ghi chú, thời điểm tạo.
     */
    public record DocumentMetadata(
            String documentType,
            String issuingAuthority,
            String documentNumber,
            LocalDate issuedDate,
            UUID receivedByPublicId,
            Instant receivedAt,
            String evidenceReference,
            String notes,
            Instant createdAt
    ) {
    }

    /**
     * Một mục lịch sử: {@code result}, {@code verifierPublicId}, {@code requestedAt}, {@code decidedAt}, {@code reason}.
     */
    public record DecisionHistory(
            String result,
            UUID verifierPublicId,
            Instant requestedAt,
            Instant decidedAt,
            String reason
    ) {
    }
}