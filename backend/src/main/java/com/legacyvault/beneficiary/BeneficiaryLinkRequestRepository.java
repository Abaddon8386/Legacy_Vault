package com.legacyvault.beneficiary;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface BeneficiaryLinkRequestRepository extends JpaRepository<BeneficiaryLinkRequest, Long> {

	Optional<BeneficiaryLinkRequest> findByPublicId(UUID publicId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select r from BeneficiaryLinkRequest r where r.publicId = :publicId")
	Optional<BeneficiaryLinkRequest> findByPublicIdForUpdate(@Param("publicId") UUID publicId);

	List<BeneficiaryLinkRequest> findByRequesterUserIdOrderByCreatedAtDesc(Long requesterUserId);

	List<BeneficiaryLinkRequest> findByVerificationCaseIdAndStatusOrderByCreatedAtAsc(Long caseId, String status);

	Optional<BeneficiaryLinkRequest> findByRequesterUserIdAndVerificationCaseIdAndStatus(Long requesterUserId,
			Long caseId, String status);

	long countByRequesterUserIdAndStatus(Long requesterUserId, String status);
}
