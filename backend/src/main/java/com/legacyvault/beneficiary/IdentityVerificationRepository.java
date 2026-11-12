package com.legacyvault.beneficiary;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository cho bảng {@code beneficiary_identity_verifications}, dùng bởi {@code IdentityVerificationService}.
 */
public interface IdentityVerificationRepository extends JpaRepository<IdentityVerificationRecord, Long> {
	/**
	 * Lấy lịch sử xác minh của một người thụ hưởng, mới nhất trước.
	 */
	List<IdentityVerificationRecord> findAllByBeneficiary_PublicIdOrderByVerifiedAtDesc(UUID beneficiaryPublicId);
}
