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
 * Nghiệp vụ ST-21 (LV-LEG-001): Legal phê duyệt hoặc từ chối đúng snapshot hồ sơ căn cứ mà mình đã xem xét.
 * Quyết định được gắn với phiên bản, sha256 của chứng cứ và hash phạm vi phân bổ để phê duyệt cũ không áp dụng cho dữ liệu đã thay đổi.
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
     * Ghi quyết định phê duyệt/từ chối của Legal.
     *
     * Xử lý: validate đầu vào (lý do bắt buộc, tối đa 1000 ký tự); khóa Vault/ca/hồ sơ qua LegalBasisCaseAccess; yêu cầu ca mở, không ON_HOLD,
     * Vault ở LEGAL_BASIS_VERIFICATION, hồ sơ FORWARDED; kiểm tra căn cứ tòa án hợp lệ; so khớp phiên bản/sha256/allocation hash do client gửi
     * với phiên bản mới nhất và với snapshot đã review (FRESH); cập nhật trạng thái phân bổ, lưu lịch sử quyết định, ghi audit
     * và thông báo cho Staff.
     *
     * @param caseId public UUID của ca
     * @param request quyết định kèm snapshot mà Legal đã xem (versionNo, sha256Hash, allocationHash) và lý do
     * @return kết quả quyết định cùng hash đã chốt
     * @throws BusinessException VALIDATION_FAILED, BASIS_DOSSIER_INVALID_STATE, LEGAL_DECISION_STALE
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
        // Chống "phê duyệt mù": snapshot client gửi phải đúng bằng phiên bản mới nhất đang lưu, nếu không dữ liệu đã đổi sau khi Legal xem.
        if (!Objects.equals(request.versionNo(), current.versionNo())
                || !current.sha256Hash().equalsIgnoreCase(request.sha256Hash())
                || !currentAllocationHash.equalsIgnoreCase(request.allocationHash())) {
            throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
        }
        // Ngoài khớp với client, snapshot lúc Legal bấm hoàn tất review (lastReviewed*) cũng phải trùng dữ liệu hiện tại; thiếu bước review hoặc review đã cũ thì không được quyết định.
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
        // Đồng bộ trạng thái APPROVED/REJECTED xuống các dòng phân bổ của phiên bản; dòng SUPERSEDED không bị đụng tới.
        allocations.updateStatusForVersion(versionId,
                request.decision() == LegalApprovalRequest.Decision.APPROVE
                        ? LegalBasisVersionAllocation.STATUS_APPROVED
                        : LegalBasisVersionAllocation.STATUS_REJECTED);
        String reason = request.reason() == null ? "" : request.reason().trim();
        // Lưu quyết định vào lịch sử (append-only). reviewStatus là LEGAL_APPROVED/LEGAL_REJECTED còn reasonCode là APPROVE/REJECT, LegalApprovalGuard dựa vào cặp này để kiểm tra phê duyệt.
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
     * Tính allocation hash của phân bổ hiện hành đúng phiên bản (AllocationScopeHash).
     */
    private String allocationHash(Long dossierId, int versionNo) {
        List<AllocationRow> rows = allocations.findRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo)
                .toList();
        return AllocationScopeHash.hashApprovalRows(rows);
    }

    private static boolean sameHash(String first, String second) {
        return first != null && second != null && first.equalsIgnoreCase(second);
    }
}
