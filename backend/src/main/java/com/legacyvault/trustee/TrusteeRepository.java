package com.legacyvault.trustee;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository JPA cho bảng {@code trustees}, dùng bởi {@code TrusteeService}, {@code TrusteeContactService}, {@code CaseContactService}.
 */
public interface TrusteeRepository extends JpaRepository<Trustee, Long> {
	/**
	 * Trustee đầu tiên của Vault theo trạng thái (thường APPOINTED).
	 */
	Optional<Trustee> findFirstByVault_VaultIdAndStatus(Long vaultId, String status);
	/**
	 * Vault đã có Trustee ở trạng thái này chưa (kiểm tra trước khi bổ nhiệm).
	 */
	boolean existsByVault_VaultIdAndStatus(Long vaultId, String status);
	/**
	 * Mọi Trustee của Vault theo trạng thái, theo thứ tự id tăng dần.
	 */
	java.util.List<Trustee> findAllByVault_VaultIdAndStatusOrderByIdAsc(Long vaultId, String status);
	/**
	 * Tìm Trustee theo public id và phải thuộc Vault của Owner chỉ định (chống truy cập chéo).
	 */
	Optional<Trustee> findByPublicIdAndVault_OwnerUserId(UUID publicId, Long ownerUserId);
	/**
	 * Tìm Trustee theo public id (dùng cho luồng Staff, sau đó kiểm tra hồ sơ).
	 */
	Optional<Trustee> findByPublicId(UUID publicId);
	/**
	 * Trustee có tồn tại theo public id hay không.
	 */
	boolean existsByPublicId(UUID publicId);
}
