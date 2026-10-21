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
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

import jakarta.persistence.EntityManager;

/** Records authenticated Staff attestation; client-supplied identity-verification results are not accepted. */
@Service
public class CounterIdentityAttestationService {
    private final VerificationCaseRepository cases;
    private final StaffCaseLockRepository caseLocks;
    private final BeneficiaryRepository beneficiaries;
    private final BeneficiaryCounterAttestationRepository attestations;
    private final StaffContextService staff;
    private final StaffVaultCaseGuard caseGuard;
    private final EntityManager entities;
    private final AuditService audit;

    public CounterIdentityAttestationService(VerificationCaseRepository cases, StaffCaseLockRepository caseLocks,
            BeneficiaryRepository beneficiaries, BeneficiaryCounterAttestationRepository attestations,
            StaffContextService staff, StaffVaultCaseGuard caseGuard, EntityManager entities, AuditService audit) {
        this.cases = cases;
        this.caseLocks = caseLocks;
        this.beneficiaries = beneficiaries;
        this.attestations = attestations;
        this.staff = staff;
        this.caseGuard = caseGuard;
        this.entities = entities;
        this.audit = audit;
    }

    @Transactional
    public CounterIdentityAttestationDtos.Response attest(UUID caseId, UUID beneficiaryId,
            CounterIdentityAttestationDtos.Request request) {
        User actor = staff.requireStaff();
        VerificationCase preview = cases.findByPublicIdAndAssignedStaffUserId(caseId, actor.getUserId())
                .orElseThrow(CounterIdentityAttestationService::notFound);

        // Match the established Vault -> Case locking order and recheck after acquiring both locks.
        caseGuard.requireOpenForWrite(preview.getVaultId(), actor.getUserId());
        VerificationCase lockedCase = caseLocks.findOwnedByStaffForUpdate(caseId, actor.getUserId())
                .orElseThrow(CounterIdentityAttestationService::notFound);
        entities.refresh(lockedCase);
        if (!lockedCase.isOpen()) throw notFound();

        Beneficiary beneficiary = beneficiaries.findByPublicIdAndVault_VaultId(beneficiaryId, lockedCase.getVaultId())
                .orElseThrow(CounterIdentityAttestationService::notFound);
        entities.refresh(beneficiary);
        if (!lockedCase.getVaultId().equals(beneficiary.getVault().getVaultId())) throw notFound();

        String reference = request.evidenceReference().trim();
        BeneficiaryCounterAttestation saved = attestations.saveAndFlush(
                new BeneficiaryCounterAttestation(lockedCase, beneficiary, actor.getUserId(), reference,
                        request.normalizedConfirmedEmail()));
        audit.record(actor.getUserId(), lockedCase.getVaultId(), "BENEFICIARY_COUNTER_ATTESTED",
                "BENEFICIARY_COUNTER_ATTESTATION", saved.getId(), "USER",
                Map.of("caseId", caseId.toString(), "beneficiaryId", beneficiaryId.toString(),
                        "evidenceReferenceRecorded", true, "confirmedEmailRecorded",
                        saved.getConfirmedEmail() != null));
        return CounterIdentityAttestationDtos.Response.from(saved, actor);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }
}
