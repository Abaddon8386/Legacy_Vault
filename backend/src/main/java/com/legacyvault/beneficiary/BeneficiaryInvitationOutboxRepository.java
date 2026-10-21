package com.legacyvault.beneficiary;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BeneficiaryInvitationOutboxRepository extends JpaRepository<BeneficiaryInvitationOutbox, Long> {
    Optional<BeneficiaryInvitationOutbox> findByBeneficiaryIdAndRequestGeneration(Long beneficiaryId,
            int requestGeneration);
}
