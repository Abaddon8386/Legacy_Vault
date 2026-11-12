package com.legacyvault.verification.service;

import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;
import java.util.UUID;

/**
 * Cho phép Legal tạm dừng (hold) việc xem xét hồ sơ căn cứ khi có tranh chấp mới hoặc chưa xác định (ST-16, LV-HOLD-001).
 *
 * <p>Được {@code LegalBasisHoldController} gọi qua {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/hold}
 * (vai trò LEGAL_VERIFIER), body {@link HoldBasisRequest}, trả {@link BasisDossierResponse}. Ghi lịch sử phân loại
 * ({@code LegalBasisClassificationHistory}), cập nhật dossier và Vault, ghi audit {@code LEGAL_BASIS_HELD} và gửi thông
 * báo workflow cho Staff.
 */
@Service
public class LegalBasisHoldService {
    private final LegalBasisCaseAccess access;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisClassificationHistoryRepository history;
    private final BasisDossierViewService views;
    private final AuditService audit;
    private final com.legacyvault.notification.WorkflowNotificationService notifications;
    /**
     * @param access khóa Vault, case, dossier theo thứ tự chuẩn
     * @param versions repository các phiên bản hồ sơ căn cứ (lấy số phiên bản lớn nhất)
     * @param history repository lịch sử phân loại căn cứ
     * @param views dịch vụ dựng lại view hồ sơ căn cứ để trả về
     * @param audit dịch vụ ghi nhật ký kiểm toán
     * @param notifications dịch vụ ghi thông báo workflow
     */
    public LegalBasisHoldService(LegalBasisCaseAccess access, LegalBasisDossierVersionRepository versions,
            LegalBasisClassificationHistoryRepository history, BasisDossierViewService views, AuditService audit,
            com.legacyvault.notification.WorkflowNotificationService notifications) {
        this.access = access;
        this.versions = versions;
        this.history = history;
        this.views = views;
        this.audit = audit;
        this.notifications = notifications;
    }

    /**
     * Đặt hồ sơ căn cứ vào trạng thái tạm dừng.
     *
     * <p>Các bước: kiểm tra lý do (không rỗng, tối đa 1000 ký tự) và nguyên nhân; khóa Vault, case, dossier và yêu cầu
     * case mở; dossier phải còn nhận hồ sơ và Vault ở AWAITING_LEGAL_BASIS hoặc LEGAL_BASIS_VERIFICATION; lưu lịch sử phân
     * loại cũ; gọi {@code dossier.placeOnHold} (tranh chấp DISPUTED nếu nguyên nhân là NEW_DISPUTE, ngược lại
     * UNDETERMINED) với số phiên bản yêu cầu tiếp theo; chuyển Vault sang trạng thái hold; ghi audit {@code LEGAL_BASIS_HELD};
     * gửi thông báo {@code LEGAL_BASIS_HELD} cho Staff.
     *
     * @param caseId public id của hồ sơ xác minh
     * @param principal Legal Verifier đang đăng nhập
     * @param request nguyên nhân và lý do tạm dừng
     * @return view hồ sơ căn cứ sau khi tạm dừng, kèm thông báo
     * @throws BusinessException {@code VALIDATION_FAILED} khi dữ liệu không hợp lệ; {@code BASIS_DOSSIER_INVALID_STATE}
     *         khi dossier/Vault không ở trạng thái cho phép; {@code RESOURCE_NOT_FOUND}
     */
    @Transactional
    public BasisDossierResponse hold(UUID caseId, CustomUserPrincipal principal, HoldBasisRequest request) {
        Long actor = CustomUserPrincipal.requireUserId(principal);
        if (request == null || request.cause() == null || request.reason() == null || request.reason().isBlank()
                || request.reason().length() > 1000) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var locked = access.lock(caseId);
        locked.requireOpen();
        var dossier = locked.dossier();
        var vault = locked.vault();
        if (!dossier.acceptsIntake() || !(Vault.STATUS_AWAITING_LEGAL_BASIS.equals(vault.getStatus())
                || Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus())))
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        int nextVersion = versions.findMaxVersionNo(dossier.getLegalBasisDossierId()) + 1;
        String before = vault.getStatus();
        String previousRoute = dossier.getRoute();
        history.saveAndFlush(LegalBasisClassificationHistory.of(dossier));
        dossier.placeOnHold(request.reason().trim(), request.cause() == HoldBasisRequest.Cause.NEW_DISPUTE
                ? LegalBasisDossier.DISPUTE_DISPUTED : LegalBasisDossier.DISPUTE_UNDETERMINED, actor, nextVersion);
        vault.holdLegalBasisReview();
        audit.record(new AuditEvent(AuditAction.LEGAL_BASIS_HELD, AuditActorType.USER, actor, vault.getVaultId(),
                "LEGAL_BASIS_DOSSIER", dossier.getLegalBasisDossierId(), before, vault.getStatus(), null,
                Map.of("verificationCaseId", caseId.toString(), "dossierId", dossier.getPublicId().toString(),
                        "previousRoute", previousRoute, "route", "ON_HOLD", "cause", request.cause().name(),
                        "requiredVersion", dossier.getRequiredVersionNo()), "ST-16", "LV-HOLD-001"));
        var notification = notifications.record(locked.verificationCase(),
                com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF,
                "LEGAL_BASIS_HELD", "basis-hold:" + dossier.getPublicId() + ":" + dossier.getRequiredVersionNo(),
                request.reason().trim());
        return views.view(locked.verificationCase(), true).withNotification(notification);
    }
}
