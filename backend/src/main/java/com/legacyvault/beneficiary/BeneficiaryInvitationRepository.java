package com.legacyvault.beneficiary;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BeneficiaryInvitationRepository extends JpaRepository<BeneficiaryInvitation, Long> {
    Optional<BeneficiaryInvitation> findByBeneficiary_IdAndCurrentTrue(Long beneficiaryId);
    Optional<BeneficiaryInvitation> findByCodeHash(String hash);
    Optional<BeneficiaryInvitation> findByBeneficiary_IdAndGeneration(Long beneficiaryId, int generation);
    java.util.List<BeneficiaryInvitation> findAllByBeneficiary_Vault_VaultIdAndCurrentTrue(Long vaultId);
}
