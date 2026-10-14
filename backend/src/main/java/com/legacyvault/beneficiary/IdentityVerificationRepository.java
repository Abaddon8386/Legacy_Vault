package com.legacyvault.beneficiary;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface IdentityVerificationRepository extends JpaRepository<IdentityVerificationRecord, Long> {
	List<IdentityVerificationRecord> findAllByBeneficiary_PublicIdOrderByVerifiedAtDesc(UUID beneficiaryPublicId);
}
