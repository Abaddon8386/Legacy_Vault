package com.legacyvault.beneficiary;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BeneficiaryCounterAttestationRepository extends JpaRepository<BeneficiaryCounterAttestation, Long> {
    Optional<BeneficiaryCounterAttestation> findFirstByVerificationCase_PublicIdAndBeneficiary_PublicIdOrderByIdDesc(
            UUID casePublicId, UUID beneficiaryPublicId);
}
