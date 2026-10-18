package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverSessionResponse;
import com.legacyvault.verification.dto.HandoverSessionStatusRequest;
import com.legacyvault.verification.entity.HandoverSession;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class HandoverSessionService {
    private final HandoverSessionCaseAccess access;
    private final VerificationCaseRepository cases;
    private final HandoverSessionRepository sessions;
    private final VaultRepository vaults;
    private final AuditService audit;
    private final LegalWorkflowGuard workflow;

    public HandoverSessionService(HandoverSessionCaseAccess access, VerificationCaseRepository cases,
            HandoverSessionRepository sessions, VaultRepository vaults, AuditService audit,
            LegalWorkflowGuard workflow) {
        this.access = access;
        this.cases = cases;
        this.sessions = sessions;
        this.vaults = vaults;
        this.audit = audit;
        this.workflow = workflow;
    }

    @Transactional
    public HandoverSessionResponse open(UUID casePublicId, CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        HandoverSessionCaseAccess.LockedCase locked = access.lockByPublicCaseId(casePublicId, staffId);
        var verificationCase = locked.verificationCase();
        Vault vault = locked.vault();
        if (!verificationCase.isOpen() || !(Vault.STATUS_UNLOCKED.equals(vault.getStatus())
                || Vault.STATUS_HANDOVER_IN_PROGRESS.equals(vault.getStatus()))) {
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        }
        workflow.requireProtectedTransition(casePublicId, LegalWorkflowGuard.ProtectedTransition.HANDOVER);
        if (sessions.existsByVerificationCaseIdAndStatus(
                verificationCase.getVerificationCaseId(), HandoverSessionStatus.OPEN)) {
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_ALREADY_OPEN);
        }

        HandoverSession session = new HandoverSession(verificationCase.getVerificationCaseId(), staffId);
        try {
            session = sessions.saveAndFlush(session);
        } catch (DataIntegrityViolationException conflict) {
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_ALREADY_OPEN);
        }
        audit.record(new AuditEvent(AuditAction.HANDOVER_SESSION_OPENED, AuditActorType.USER, staffId,
                vault.getVaultId(), "HANDOVER_SESSION", session.getId(), null,
                HandoverSessionStatus.OPEN.name(), null,
                Map.of("sessionPublicId", session.getPublicId().toString(),
                        "casePublicId", verificationCase.getPublicId().toString()),
                "ST-23", "LV-HANDOVER-001"));
        return toResponse(session, verificationCase, vault, principal);
    }

    @Transactional(readOnly = true)
    public List<HandoverSessionResponse> list(UUID casePublicId, HandoverSessionStatus status,
            CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        var verificationCase = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(() -> notFound());
        Vault vault = vaults.findById(verificationCase.getVaultId()).orElseThrow(() -> notFound());
        List<HandoverSession> found = status == null
                ? sessions.findByVerificationCaseIdAndStaffUserIdOrderByOpenedAtDesc(
                        verificationCase.getVerificationCaseId(), staffId)
                : sessions.findByVerificationCaseIdAndStaffUserIdAndStatusOrderByOpenedAtDesc(
                        verificationCase.getVerificationCaseId(), staffId, status);
        return found.stream().map(session -> toResponse(session, verificationCase, vault, principal)).toList();
    }

    @Transactional(readOnly = true)
    public HandoverSessionResponse get(UUID casePublicId, UUID sessionPublicId,
            CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        var verificationCase = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(() -> notFound());
        HandoverSession session = sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(
                        sessionPublicId, verificationCase.getVerificationCaseId(), staffId)
                .orElseThrow(() -> notFound());
        Vault vault = vaults.findById(verificationCase.getVaultId()).orElseThrow(() -> notFound());
        return toResponse(session, verificationCase, vault, principal);
    }

    @Transactional
    public HandoverSessionResponse updateStatus(UUID casePublicId, UUID sessionPublicId,
            HandoverSessionStatusRequest request, CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        if (request == null || request.status() == null) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var caseView = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(() -> notFound());
        sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(
                        sessionPublicId, caseView.getVerificationCaseId(), staffId)
                .orElseThrow(() -> notFound());

        HandoverSessionCaseAccess.LockedCase locked = access.lock(
                caseView.getVerificationCaseId(), staffId);
        var verificationCase = locked.verificationCase();
        HandoverSession session = sessions.findByPublicIdAndCaseAndStaffForUpdate(
                        sessionPublicId, verificationCase.getVerificationCaseId(), staffId)
                .orElseThrow(() -> notFound());
        if (session.getStatus() != HandoverSessionStatus.OPEN) {
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        }

        HandoverSessionStatus target = HandoverSessionStatus.CANCELLED;
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        session.close(target, now);
        session = sessions.saveAndFlush(session);
        audit.record(new AuditEvent(AuditAction.HANDOVER_SESSION_CANCELLED, AuditActorType.USER, staffId, locked.vault().getVaultId(),
                "HANDOVER_SESSION", session.getId(), HandoverSessionStatus.OPEN.name(), target.name(), null,
                Map.of("sessionPublicId", session.getPublicId().toString(),
                        "casePublicId", verificationCase.getPublicId().toString()),
                "ST-23", "LV-HANDOVER-001"));
        return toResponse(session, verificationCase, locked.vault(), principal);
    }

    private static HandoverSessionResponse toResponse(HandoverSession session,
            com.legacyvault.verification.entity.VerificationCase verificationCase, Vault vault,
            CustomUserPrincipal principal) {
        return new HandoverSessionResponse(session.getPublicId(), verificationCase.getPublicId(),
                vault.getPublicId(), principal.publicId(), session.getStatus(),
                session.getOpenedAt(), session.getClosedAt());
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }
}
