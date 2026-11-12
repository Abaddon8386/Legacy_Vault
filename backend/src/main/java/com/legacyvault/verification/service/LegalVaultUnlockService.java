package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.LegalVaultUnlockResponse;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Legal mở khóa Vault sau khi phê duyệt hồ sơ căn cứ (ST-22, LV-LEG-001).
 *
 * <p>Được {@code LegalVaultUnlockController} gọi qua
 * {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/unlock} (vai trò LEGAL_VERIFIER), trả
 * {@link LegalVaultUnlockResponse}. Dựa vào {@link LegalWorkflowGuard} để bảo đảm điều kiện pháp lý; cập nhật bảng
 * {@code vaults}; ghi audit {@code LEGAL_VAULT_UNLOCKED} và gửi thông báo cho Staff.
 */
@Service
public class LegalVaultUnlockService {
    private final com.legacyvault.notification.WorkflowNotificationService notifications;
    private final LegalWorkflowGuard workflow;
    private final VaultRepository vaults;
    private final AuditService audit;

    /**
     * @param workflow guard kiểm tra điều kiện chuyển trạng thái pháp lý
     * @param vaults repository Vault
     * @param audit dịch vụ ghi nhật ký kiểm toán
     * @param notifications dịch vụ thông báo workflow
     */
    public LegalVaultUnlockService(LegalWorkflowGuard workflow, VaultRepository vaults, AuditService audit, com.legacyvault.notification.WorkflowNotificationService notifications) {
        this.notifications = notifications;
        this.workflow = workflow;
        this.vaults = vaults;
        this.audit = audit;
    }

    /**
     * Mở khóa Vault.
     *
     * <p>Gọi {@code requireProtectedTransition(UNLOCK)} (khóa dữ liệu, kiểm tra không hold, dossier đã forward, tuyến tòa và
     * phê duyệt hiện hành), chuyển Vault sang UNLOCKED qua {@code unlockAfterLegalApproval()}, lưu, ghi audit
     * {@code LEGAL_VAULT_UNLOCKED} và gửi thông báo {@code LEGAL_VAULT_UNLOCKED}.
     *
     * @param caseId public id của hồ sơ xác minh
     * @param principal Legal Verifier đang đăng nhập
     * @return thông tin Vault sau khi mở khóa, kèm thông báo
     * @throws BusinessException các lỗi từ guard như {@code BASIS_DOSSIER_INVALID_STATE}, {@code LEGAL_WORKFLOW_ON_HOLD},
     *         {@code LEGAL_APPROVAL_REQUIRED}, {@code LEGAL_DECISION_STALE}
     */
    @Transactional
    public LegalVaultUnlockResponse unlock(UUID caseId, CustomUserPrincipal principal) {
        Long actorId = CustomUserPrincipal.requireUserId(principal);
        LegalBasisCaseAccess.LockedCase locked = workflow.requireProtectedTransition(
                caseId, LegalWorkflowGuard.ProtectedTransition.UNLOCK);
        Vault vault = locked.vault();
        String before = vault.getStatus();
        vault.unlockAfterLegalApproval();
        Vault saved = vaults.saveAndFlush(vault);
        audit.record(new AuditEvent(AuditAction.LEGAL_VAULT_UNLOCKED, AuditActorType.USER,
                actorId, saved.getVaultId(), "VAULT", saved.getVaultId(), before,
                Vault.STATUS_UNLOCKED, null,
                Map.of("casePublicId", locked.verificationCase().getPublicId().toString(),
                        "stepId", "ST-22", "ruleId", "LV-LEG-001"),
                "ST-22", "LV-LEG-001"));
        var notification = notifications.record(locked.verificationCase(), com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF, "LEGAL_VAULT_UNLOCKED", "unlock:" + caseId, null);
        return new LegalVaultUnlockResponse(locked.verificationCase().getPublicId(), saved.getPublicId(),
                saved.getStatus(), principal.publicId(), saved.getUpdatedAt()).withNotification(notification);
    }
}
