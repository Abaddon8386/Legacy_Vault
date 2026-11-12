package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.dto.LegalApprovalResponse;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisDossierVersion;
import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.BasisVersionRow;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Ghi quyết định phê duyệt hoặc từ chối cuối cùng của Legal Verifier đối với hồ sơ căn cứ (ST-21, LV-LEG-001).
 *
 * <p>Được {@code LegalBasisDossierController} gọi qua
 * {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/decision} (vai trò LEGAL_VERIFIER),
 * body {@link LegalApprovalRequest}, trả {@link LegalApprovalResponse}. Dùng các bảng phiên bản hồ sơ, phân bổ theo
 * phiên bản và lịch sử xem xét; ghi audit {@code LEGAL_BASIS_DECIDED} và gửi thông báo cho Staff.
 */
@Service
public class LegalApprovalService {
    private final com.legacyvault.notification.WorkflowNotificationService notifications;
    private static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";

    private final LegalBasisCaseAccess access;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final LegalBasisReviewHistoryRepository history;
    private final AuditService audit;
    private final CourtRouteGuard court;

    /**
     * @param access khóa Vault, case, dossier theo thứ tự chuẩn
     * @param versions repository phiên bản hồ sơ căn cứ
     * @param allocations repository dòng phân bổ theo phiên bản
     * @param history repository lịch sử xem xét/quyết định
     * @param audit dịch vụ ghi nhật ký kiểm toán
     * @param court guard kiểm tra quyết định tòa án khi đi theo tuyến tòa
     * @param notifications dịch vụ ghi thông báo workflow
     */
    public LegalApprovalService(LegalBasisCaseAccess access,
            LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations,
            LegalBasisReviewHistoryRepository history,
            AuditService audit, CourtRouteGuard court, com.legacyvault.notification.WorkflowNotificationService notifications) {
        this.notifications = notifications;
        this.access = access;
        this.versions = versions;
        this.allocations = allocations;
        this.history = history;
        this.audit = audit;
        this.court = court;
    }

    /**
     * Phê duyệt hoặc từ chối hồ sơ căn cứ.
     *
     * <p>Các bước: kiểm tra dữ liệu (quyết định, số phiên bản, hash SHA-256, hash phân bổ, lý do tối đa 1000 ký tự); khóa
     * Vault/case/dossier và yêu cầu case mở, không bị hold; Vault phải ở LEGAL_BASIS_VERIFICATION, dossier FORWARDED và có
     * thể xem xét; kiểm tra quyết định tòa án hợp lệ; lấy phiên bản mới nhất đã forward và không thấp hơn phiên bản yêu cầu;
     * đối chiếu phiên bản/SHA-256/hash phân bổ trong request và trạng thái FRESH của dossier để chống quyết định cũ; cập nhật
     * trạng thái các dòng phân bổ (APPROVED/REJECTED); lưu lịch sử quyết định; ghi audit {@code LEGAL_BASIS_DECIDED}; gửi
     * thông báo {@code LEGAL_BASIS_DECIDED} cho Staff.
     *
     * @param caseId public id của hồ sơ xác minh
     * @param principal Legal Verifier đang đăng nhập
     * @param request quyết định cùng dấu vết phiên bản/hash mà Legal đã xem
     * @return kết quả quyết định
     * @throws BusinessException {@code VALIDATION_FAILED}, {@code BASIS_DOSSIER_INVALID_STATE},
     *         {@code LEGAL_DECISION_STALE}, {@code RESOURCE_NOT_FOUND}, cùng các lỗi từ guard tòa án và hold
     */
    @Transactional
    public LegalApprovalResponse decide(UUID caseId, CustomUserPrincipal principal, LegalApprovalRequest request) {
        Long actorId = CustomUserPrincipal.requireUserId(principal);
        if (caseId == null || request == null || request.decision() == null
                || request.versionNo() == null || request.versionNo() < 1
                || request.sha256Hash() == null || request.allocationHash() == null
                || request.reason() == null || request.reason().isBlank()
                || request.reason().trim().length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        LegalBasisCaseAccess.LockedCase locked = access.lock(caseId);
        locked.requireOpen();
        LegalBasisDossier dossier = locked.dossier();
        Vault vault = locked.vault();
        LegalWorkflowGuard.requireNotOnHold(vault, dossier);
        if (!Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus())
                || !LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())
                || !dossier.isLegalReviewable()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        court.requireValidDecision(dossier);

        List<BasisVersionRow> rows = versions.findRows(dossier.getLegalBasisDossierId());
        BasisVersionRow current = rows.isEmpty() ? null : rows.get(0);
        if (current == null || current.sha256Hash() == null || current.sha256Hash().isBlank()
                || !LegalBasisDossierVersion.FORWARDED.equals(current.forwardStatus())
                || current.versionNo() < dossier.getRequiredVersionNo()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        String currentAllocationHash = allocationHash(dossier.getLegalBasisDossierId(), current.versionNo());
        if (!Objects.equals(request.versionNo(), current.versionNo())
                || !current.sha256Hash().equalsIgnoreCase(request.sha256Hash())
                || !currentAllocationHash.equalsIgnoreCase(request.allocationHash())) {
            throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
        }
        if (!"FRESH".equals(dossier.getReviewStatus())
                || !Objects.equals(dossier.getLastReviewedVersionNo(), current.versionNo())
                || !sameHash(dossier.getLastReviewedSha256Hash(), current.sha256Hash())
                || !Objects.equals(dossier.getLastReviewedDisputeStatus(), dossier.getDisputeStatus())
                || !sameHash(dossier.getLastReviewedAllocationHash(), currentAllocationHash)) {
            throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
        }

        Long versionId = versions.findByLegalBasisDossierIdAndVersionNo(
                        dossier.getLegalBasisDossierId(), current.versionNo())
                .map(LegalBasisDossierVersion::getDossierVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.LEGAL_DECISION_STALE));
        String decision = request.decision() == LegalApprovalRequest.Decision.APPROVE
                ? "LEGAL_APPROVED" : "LEGAL_REJECTED";
        allocations.updateStatusForVersion(versionId,
                request.decision() == LegalApprovalRequest.Decision.APPROVE
                        ? LegalBasisVersionAllocation.STATUS_APPROVED
                        : LegalBasisVersionAllocation.STATUS_REJECTED);
        String reason = request.reason() == null ? "" : request.reason().trim();
        var savedDecision = history.saveAndFlush(new LegalBasisReviewHistory(
                dossier.getLegalBasisDossierId(), versionId, current.versionNo(), current.sha256Hash(),
                dossier.getDisputeStatus(), currentAllocationHash, decision,
                request.decision().name(), reason, actorId));
        audit.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_DECIDED, AuditActorType.USER, actorId, vault.getVaultId(),
                ENTITY_TYPE, dossier.getLegalBasisDossierId(), dossier.getReviewStatus(), decision, null,
                Map.of("decision", request.decision().name(), "versionNo", current.versionNo(),
                        "sha256Hash", current.sha256Hash(), "allocationHash", currentAllocationHash),
                "ST-21", "LV-LEG-001"));

        var notification = notifications.record(locked.verificationCase(), com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF, "LEGAL_BASIS_DECIDED", "decision:" + savedDecision.getPublicId(), reason);
        return new LegalApprovalResponse(dossier.getPublicId(), decision, current.versionNo(),
                current.sha256Hash(), currentAllocationHash, principal.publicId(), LocalDateTime.now(ZoneOffset.UTC)).withNotification(notification);
    }

    /**
     * Tính hash phạm vi phân bổ của phiên bản {@code versionNo} trong dossier.
     */
    private String allocationHash(Long dossierId, int versionNo) {
        List<AllocationRow> rows = allocations.findRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo)
                .toList();
        return AllocationScopeHash.hashApprovalRows(rows);
    }

    /**
     * So sánh hai hash không phân biệt hoa thường; {@code false} nếu một trong hai là null.
     */
    private static boolean sameHash(String first, String second) {
        return first != null && second != null && first.equalsIgnoreCase(second);
    }
}
