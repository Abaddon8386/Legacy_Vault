package com.legacyvault.beneficiary;

import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.HandoverScopeResolver;
import com.legacyvault.verification.service.LegalWorkflowGuard;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

import jakarta.persistence.EntityManager;

/** PS-106: Staff-confirmed address + existing PS-86 token lifecycle + encrypted transactional outbox. */
@Service
public class StaffInvitationEmailService {
    private final VerificationCaseRepository cases;
    private final StaffCaseLockRepository caseLocks;
    private final BeneficiaryRepository beneficiaries;
    private final BeneficiaryCounterAttestationRepository attestations;
    private final BeneficiaryInvitationRepository invitations;
    private final StaffContextService staff;
    private final StaffVaultCaseGuard caseGuard;
    private final LegalWorkflowGuard legalGuard;
    private final LegalBasisDossierVersionRepository versions;
    private final HandoverScopeResolver handoverScope;
    private final BeneficiaryInvitationService invitationService;
    private final InvitationMailOutboxService outboxService;
    private final AuditService audit;
    private final EntityManager entities;
    private final InvitationMailConfiguration mailConfig;

    public StaffInvitationEmailService(VerificationCaseRepository cases, StaffCaseLockRepository caseLocks,
            BeneficiaryRepository beneficiaries, BeneficiaryCounterAttestationRepository attestations,
            BeneficiaryInvitationRepository invitations, StaffContextService staff, StaffVaultCaseGuard caseGuard,
            LegalWorkflowGuard legalGuard, LegalBasisDossierVersionRepository versions,
            HandoverScopeResolver handoverScope, BeneficiaryInvitationService invitationService,
            InvitationMailOutboxService outboxService, AuditService audit, EntityManager entities, InvitationMailConfiguration mailConfig) {
        this.cases = cases;
        this.caseLocks = caseLocks;
        this.beneficiaries = beneficiaries;
        this.attestations = attestations;
        this.invitations = invitations;
        this.staff = staff;
        this.caseGuard = caseGuard;
        this.legalGuard = legalGuard;
        this.versions = versions;
        this.handoverScope = handoverScope;
        this.invitationService = invitationService;
        this.outboxService = outboxService;
        this.audit = audit;
        this.entities = entities;
        this.mailConfig = mailConfig;
    }

    @Transactional
    public InvitationEmailDtos.Queued request(UUID caseId, UUID beneficiaryId, int expectedGeneration) {
        User actor = staff.requireStaff();
        VerificationCase preview = cases.findByPublicIdAndAssignedStaffUserId(caseId, actor.getUserId())
                .orElseThrow(StaffInvitationEmailService::notFound);
        caseGuard.requireOpenForWrite(preview.getVaultId(), actor.getUserId());
        VerificationCase lockedCase = caseLocks.findOwnedByStaffForUpdate(caseId, actor.getUserId())
                .orElseThrow(StaffInvitationEmailService::notFound);
        entities.refresh(lockedCase);
        if (!lockedCase.isOpen() || !preview.getVaultId().equals(lockedCase.getVaultId())) throw notFound();

        var legal = legalGuard.requireProtectedTransition(caseId, LegalWorkflowGuard.ProtectedTransition.HANDOVER);
        if (!legal.verificationCase().getVerificationCaseId().equals(lockedCase.getVerificationCaseId())) throw notFound();

        Beneficiary beneficiary = beneficiaries.findByPublicIdAndVault_VaultId(beneficiaryId, lockedCase.getVaultId())
                .orElseThrow(StaffInvitationEmailService::notFound);
        entities.refresh(beneficiary);
        if (!Beneficiary.VERIFIED_AT_COUNTER.equals(beneficiary.getIdentityVerificationStatus())) {
            throw new BusinessException(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED);
        }
        if (beneficiary.hasAccount()) throw new BusinessException(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED);

        int currentVersion = versions.findMaxVersionNo(legal.dossier().getLegalBasisDossierId());
        handoverScope.resolve(legal.dossier().getLegalBasisDossierId(), currentVersion, beneficiaryId);

        BeneficiaryCounterAttestation attestation = attestations
                .findFirstByVerificationCase_PublicIdAndBeneficiary_PublicIdOrderByIdDesc(caseId, beneficiaryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED));
        if (attestation.getConfirmedEmail() == null || attestation.getConfirmedEmail().isBlank()) {
            throw new BusinessException(ErrorCode.BENEFICIARY_INVITATION_COUNTER_EMAIL_REQUIRED);
        }

        var duplicate = outboxService.findByRequest(beneficiary.getId(), expectedGeneration);
        if (duplicate.isPresent()) return queued(duplicate.get());

        InvitationDtos.Issued issued = invitationService.issueBoundForStaff(beneficiary,
                attestation.getConfirmedEmail(), actor.getUserId(), expectedGeneration);
        BeneficiaryInvitation invitation = invitations.findByBeneficiary_IdAndGeneration(
                beneficiary.getId(), issued.invitation().generation())
                .orElseThrow(() -> new IllegalStateException("Issued invitation was not persisted"));
        BeneficiaryInvitationOutbox outbox = outboxService.enqueueForCase(invitation, beneficiary.getId(),
                expectedGeneration, attestation.getConfirmedEmail(), issued.code(), lockedCase.getVerificationCaseId(), actor.getUserId());
        audit.record(actor.getUserId(), lockedCase.getVaultId(), "BENEFICIARY_INVITATION_EMAIL_QUEUED",
                "BENEFICIARY_INVITATION_OUTBOX", outbox.getId(), "USER",
                Map.of("caseId", caseId.toString(), "beneficiaryId", beneficiaryId.toString(),
                        "invitationGeneration", invitation.getGeneration(), "queueStatus", "QUEUED",
                        "transportStatus", mailConfig.transportStatus()));
        return queued(outbox);
    }

    private InvitationEmailDtos.Queued queued(BeneficiaryInvitationOutbox row) {
        return new InvitationEmailDtos.Queued(row.getPublicId(), row.getInvitationPublicId(),
                row.getInvitationGeneration(), row.getTransportStatus(), mailConfig.transportStatus());
    }

    private static BusinessException notFound() { return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND); }
}
