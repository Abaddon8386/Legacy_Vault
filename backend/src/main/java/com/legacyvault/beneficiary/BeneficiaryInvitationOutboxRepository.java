package com.legacyvault.beneficiary;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Repository cho outbox thư mời. */
public interface BeneficiaryInvitationOutboxRepository extends JpaRepository<BeneficiaryInvitationOutbox, Long> {
    /** Tra cứu theo (beneficiary, requestGeneration) để bảo đảm idempotent: cùng một yêu cầu gửi lại không tạo thêm outbox/mã mới. */
    Optional<BeneficiaryInvitationOutbox> findByBeneficiaryIdAndRequestGeneration(Long beneficiaryId,
            int requestGeneration);
}
