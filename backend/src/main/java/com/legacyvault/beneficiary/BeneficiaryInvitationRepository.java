package com.legacyvault.beneficiary;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository cho bảng {@code beneficiary_invitations}; dùng bởi {@code BeneficiaryInvitationService}, {@code StaffInvitationEmailService} và {@code CounterBeneficiaryService}.
 */
public interface BeneficiaryInvitationRepository extends JpaRepository<BeneficiaryInvitation, Long> {
    /**
     * Lấy mã mời hiện hành của một người thụ hưởng.
     */
    Optional<BeneficiaryInvitation> findByBeneficiary_IdAndCurrentTrue(Long beneficiaryId);
    /**
     * Tìm lời mời theo hash của mã (dùng khi đổi mã lấy liên kết tài khoản).
     */
    Optional<BeneficiaryInvitation> findByCodeHash(String hash);
    /**
     * Lấy lời mời theo người thụ hưởng và thế hệ.
     */
    Optional<BeneficiaryInvitation> findByBeneficiary_IdAndGeneration(Long beneficiaryId, int generation);
    /**
     * Lấy mọi mã hiện hành của một Vault (hiển thị cho Staff ở quầy).
     */
    java.util.List<BeneficiaryInvitation> findAllByBeneficiary_Vault_VaultIdAndCurrentTrue(Long vaultId);
}
