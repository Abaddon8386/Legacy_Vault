package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Hồ sơ căn cứ phân chia của một ca. {@code routeReason} chỉ có khi người xem là Legal (lý do phân loại có thể chứa
 * thông tin tranh chấp); với Staff nó là {@code null}. {@code versions} mới nhất trước.
 *
 * Trả về từ nhiều endpoint của hồ sơ căn cứ (Staff và Legal), ví dụ
 * {@code GET /api/v1/staff/verification-cases/{caseId}/basis-dossier} và
 * {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier}.
 *
 * Các trường:
 * - {@code id}, {@code caseId}: UUID công khai của hồ sơ và ca xác minh.
 * - {@code route}: nhánh phân loại (NOTARIAL, COURT, ON_HOLD).
 * - {@code status}, {@code disputeStatus}: trạng thái hồ sơ và trạng thái tranh chấp.
 * - {@code routeReason}: lý do phân loại (null với Staff).
 * - {@code classifiedBy}: UUID Legal đã phân loại.
 * - {@code createdAt}, {@code updatedAt}: thời gian UTC.
 * - {@code versions}: danh sách {@link BasisVersionResponse}, mới nhất trước.
 * - {@code requiredVersion}: phiên bản Legal yêu cầu.
 * - {@code notification}: biên nhận gửi thông báo workflow (có thể null).
 * - {@code currentDecision}: quyết định Legal còn hiệu lực với snapshot hiện tại (có thể null).
 */
public record BasisDossierResponse(UUID id,
        UUID caseId,
        String route,
        String status,
        String disputeStatus,
        String routeReason,
        UUID classifiedBy,
        Instant createdAt,
        Instant updatedAt,
        List<BasisVersionResponse> versions,
        int requiredVersion, com.legacyvault.notification.WorkflowNotificationService.Receipt notification,
        CurrentBasisDecision currentDecision) {
    /**
     * Constructor rút gọn: không có {@code notification} và {@code currentDecision} (đặt null).
     */
    public BasisDossierResponse(UUID id,
        UUID caseId,
        String route,
        String status,
        String disputeStatus,
        String routeReason,
        UUID classifiedBy,
        Instant createdAt,
        Instant updatedAt,
        List<BasisVersionResponse> versions,
        int requiredVersion) { this(id, caseId, route, status, disputeStatus, routeReason, classifiedBy, createdAt, updatedAt, versions, requiredVersion, null, null); }
    /**
     * Trả bản sao của response có gắn biên nhận thông báo {@code receipt}.
     */
    public BasisDossierResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new BasisDossierResponse(id, caseId, route, status, disputeStatus, routeReason, classifiedBy, createdAt, updatedAt, versions, requiredVersion, receipt, currentDecision); }
}
