package com.legacyvault.beneficiary;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Repository cho {@link BeneficiaryCounterAttestation}: các bản ghi Staff xác nhận danh tính trực tiếp tại quầy (append-only). */
public interface BeneficiaryCounterAttestationRepository extends JpaRepository<BeneficiaryCounterAttestation, Long> {
    /**
     * Lấy bản xác nhận mới nhất của một người thụ hưởng trong một hồ sơ (id lớn nhất = mới nhất).
     * Dùng khi Staff gửi email mời để lấy {@code confirmedEmail} đã được xác nhận tại quầy.
     */
    Optional<BeneficiaryCounterAttestation> findFirstByVerificationCase_PublicIdAndBeneficiary_PublicIdOrderByIdDesc(
            UUID casePublicId, UUID beneficiaryPublicId);

    /** Liệt kê toàn bộ bản xác nhận của một hồ sơ, mới nhất trước. */
    java.util.List<BeneficiaryCounterAttestation> findAllByVerificationCase_PublicIdOrderByIdDesc(UUID casePublicId);
}
