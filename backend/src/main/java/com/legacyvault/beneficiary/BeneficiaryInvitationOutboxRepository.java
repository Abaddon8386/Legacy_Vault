package com.legacyvault.beneficiary;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository cho bảng {@code beneficiary_invitation_mail_outbox}; dùng bởi {@code InvitationMailOutboxService}.
 */
public interface BeneficiaryInvitationOutboxRepository extends JpaRepository<BeneficiaryInvitationOutbox, Long> {
    /**
     * Tìm dòng outbox theo người thụ hưởng và thế hệ yêu cầu, để trả lại kết quả cũ khi Staff gửi lặp (idempotent).
     */
    Optional<BeneficiaryInvitationOutbox> findByBeneficiaryIdAndRequestGeneration(Long beneficiaryId,
            int requestGeneration);
}
