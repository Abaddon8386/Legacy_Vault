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

@Service
public class LegalVaultUnlockService {
    private final LegalWorkflowGuard workflow;
    private final VaultRepository vaults;
    private final AuditService audit;

    public LegalVaultUnlockService(LegalWorkflowGuard workflow, VaultRepository vaults, AuditService audit) {
        this.workflow = workflow;
        this.vaults = vaults;
        this.audit = audit;
    }

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
        return new LegalVaultUnlockResponse(locked.verificationCase().getPublicId(), saved.getPublicId(),
                saved.getStatus(), principal.publicId(), saved.getUpdatedAt());
    }
}
