package com.legacyvault.beneficiary;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository Spring Data cho bảng {@code beneficiary_counter_attestations}. Dùng bởi {@code CounterIdentityAttestationService},
 * {@code CounterBeneficiaryService} và {@code StaffInvitationEmailService}.
 */
public interface BeneficiaryCounterAttestationRepository extends JpaRepository<BeneficiaryCounterAttestation, Long> {
    /**
     * Lấy lần chứng thực mới nhất của một người thụ hưởng trong một case.
     * @param casePublicId mã công khai của case
     * @param beneficiaryPublicId mã công khai của người thụ hưởng
     */
    Optional<BeneficiaryCounterAttestation> findFirstByVerificationCase_PublicIdAndBeneficiary_PublicIdOrderByIdDesc(
            UUID casePublicId, UUID beneficiaryPublicId);

    /**
     * Lấy mọi lần chứng thực của một case, mới nhất trước (dùng để chọn bản mới nhất cho từng người thụ hưởng).
     */
    java.util.List<BeneficiaryCounterAttestation> findAllByVerificationCase_PublicIdOrderByIdDesc(UUID casePublicId);
}
