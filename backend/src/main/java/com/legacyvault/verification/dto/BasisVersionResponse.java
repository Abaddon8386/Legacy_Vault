package com.legacyvault.verification.dto;

import com.legacyvault.verification.repository.BasisVersionRow;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/**
 * Một phiên bản văn bản căn cứ. Không có nội dung file, tên file hay khóa nội bộ; thời gian UTC. {@code current} là true
 * cho phiên bản mới nhất; phiên bản cũ vẫn được giữ làm chứng cứ nhưng không được chuyển Legal.
 *
 * Các trường:
 * - {@code version}: số phiên bản.
 * - {@code legalBasisType}, {@code issuingAuthority}, {@code documentNumber}, {@code issueDate}: thông tin văn bản.
 * - {@code notaryAuthority}, {@code notarialDocumentNumber}, {@code notarizedAt}: thông tin công chứng.
 * - {@code evidenceReference}, {@code notes}: chứng cứ và ghi chú.
 * - {@code contentType}, {@code sizeBytes}, {@code sha256}: thông tin file đã số hóa.
 * - {@code forwardStatus}: trạng thái chuyển cho Legal.
 * - {@code createdBy}, {@code createdAt}, {@code forwardedAt}: người tạo và các mốc thời gian (UTC).
 * - {@code current}: true nếu là phiên bản mới nhất.
 * - {@code allocations}: các dòng phân bổ của phiên bản.
 * - {@code legalHistory}: lịch sử quyết định của Legal trên phiên bản này.
 */
public record BasisVersionResponse(
        int version,
        String legalBasisType,
        String issuingAuthority,
        String documentNumber,
        LocalDate issueDate,
        String notaryAuthority,
        String notarialDocumentNumber,
        LocalDate notarizedAt,
        String evidenceReference,
        String notes,
        String contentType,
        Long sizeBytes,
        String sha256,
        String forwardStatus,
        UUID createdBy,
        Instant createdAt,
        Instant forwardedAt,
        boolean current,
        List<AllocationResponse> allocations,
        List<LegalHistory> legalHistory
) {
    /**
     * Một mục lịch sử quyết định Legal: {@code result}, {@code reason}, {@code decidedAt}; {@code currentScope}
     * là true nếu quyết định còn áp dụng cho phạm vi hiện tại.
     */
    public record LegalHistory(UUID id, String result, String reason, Instant decidedAt, boolean currentScope) { }

    /**
     * Trả bản sao có gắn lịch sử quyết định Legal {@code entries}.
     */
    public BasisVersionResponse withLegalHistory(List<LegalHistory> entries) {
        return new BasisVersionResponse(version, legalBasisType, issuingAuthority, documentNumber, issueDate,
                notaryAuthority, notarialDocumentNumber, notarizedAt, evidenceReference, notes, contentType,
                sizeBytes, sha256, forwardStatus, createdBy, createdAt, forwardedAt, current, allocations, entries);
    }

    /**
     * Dựng response từ dòng DB {@link com.legacyvault.verification.repository.BasisVersionRow}: đổi thời gian
     * LocalDateTime sang Instant UTC, {@code legalHistory} ban đầu rỗng.
     *
     * @param row               dòng phiên bản đọc từ DB
     * @param createdBy         UUID công khai của người tạo
     * @param evidenceReference tham chiếu chứng cứ
     * @param current           phiên bản có là mới nhất hay không
     * @param allocations       các dòng phân bổ đã dựng
     * @return response
     */
    public static BasisVersionResponse from(BasisVersionRow row, UUID createdBy, String evidenceReference,
            boolean current, List<AllocationResponse> allocations) {
        return new BasisVersionResponse(
                row.versionNo(),
                row.legalBasisType(),
                row.issuingAuthority(),
                row.documentNumber(),
                row.issueDate(),
                row.notaryAuthority(),
                row.notarialDocumentNumber(),
                row.notarizedAt(),
                evidenceReference,
                row.versionNotes(),
                row.contentType(),
                row.fileSizeBytes(),
                row.sha256Hash(),
                row.forwardStatus(),
                createdBy,
                row.createdAt() == null ? null : row.createdAt().toInstant(ZoneOffset.UTC),
                row.forwardedAt() == null ? null : row.forwardedAt().toInstant(ZoneOffset.UTC),
                current,
                allocations, List.of()
        );
    }
}
