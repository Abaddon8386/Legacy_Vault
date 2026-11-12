package com.legacyvault.beneficiary;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

/**
 * Repository cho bảng {@code beneficiary_link_requests}; dùng bởi {@code BeneficiaryLinkRequestService} và {@code StaffLinkRequestService}.
 */
public interface BeneficiaryLinkRequestRepository extends JpaRepository<BeneficiaryLinkRequest, Long> {

	/**
	 * Tìm theo mã công khai (không khóa), dùng để xem trước.
	 */
	Optional<BeneficiaryLinkRequest> findByPublicId(UUID publicId);

	/**
	 * Tìm theo mã công khai với khóa ghi bi quan ({@code PESSIMISTIC_WRITE}) để tránh tranh chấp giữa hủy, hết hạn và duyệt.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select r from BeneficiaryLinkRequest r where r.publicId = :publicId")
	Optional<BeneficiaryLinkRequest> findByPublicIdForUpdate(@Param("publicId") UUID publicId);

	/**
	 * Liệt kê yêu cầu của một tài khoản, mới nhất trước.
	 */
	List<BeneficiaryLinkRequest> findByRequesterUserIdOrderByCreatedAtDesc(Long requesterUserId);

	/**
	 * Liệt kê yêu cầu theo case và trạng thái, cũ nhất trước (danh sách chờ của Staff).
	 */
	List<BeneficiaryLinkRequest> findByVerificationCaseIdAndStatusOrderByCreatedAtAsc(Long caseId, String status);

	/**
	 * Tìm yêu cầu cùng trạng thái của một tài khoản cho một case, dùng để chống gửi trùng.
	 */
	Optional<BeneficiaryLinkRequest> findByRequesterUserIdAndVerificationCaseIdAndStatus(Long requesterUserId,
			Long caseId, String status);

	/**
	 * Đếm số yêu cầu còn hiệu lực của một tài khoản, để áp giới hạn tối đa.
	 */
	long countByRequesterUserIdAndStatusAndExpiresAtAfter(Long requesterUserId, String status,
			java.time.LocalDateTime now);
}
