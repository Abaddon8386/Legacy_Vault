package com.legacyvault.beneficiary;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository cho bảng {@code beneficiaries}, dùng bởi hầu hết dịch vụ trong gói (Owner, Staff, hồ sơ pháp lý...).
 */
public interface BeneficiaryRepository extends JpaRepository<Beneficiary, Long> {
	/**
	 * Danh sách phân trang người thụ hưởng của một Vault (dùng cho {@code GET /api/v1/vaults/{vaultId}/beneficiaries}).
	 */
	Page<Beneficiary> findAllByVault_VaultId(Long vaultId, Pageable pageable);
	/**
	 * Đếm người thụ hưởng của một Vault (kiểm tra cấu hình).
	 */
	long countByVault_VaultId(Long vaultId);
	/**
	 * Tìm theo mã công khai và bảo đảm thuộc đúng Vault (chống truy cập chéo Vault).
	 */
	Optional<Beneficiary> findByPublicIdAndVault_VaultId(UUID publicId, Long vaultId);
	/**
	 * Tìm theo mã công khai, không ràng buộc Vault (dùng ở luồng Staff rồi kiểm tra quyền qua case).
	 */
	Optional<Beneficiary> findByPublicId(UUID publicId);
	/**
	 * Kiểm tra tồn tại theo mã công khai.
	 */
	boolean existsByPublicId(UUID publicId);
	/**
	 * Toàn bộ người thụ hưởng của Vault theo thứ tự tạo (hiển thị cho Staff ở quầy).
	 */
	java.util.List<Beneficiary> findAllByVault_VaultIdOrderByIdAsc(Long vaultId);
	/**
	 * Kiểm tra một tài khoản đã được liên kết với người thụ hưởng nào của Vault chưa.
	 */
	boolean existsByVault_VaultIdAndLinkedUserId(Long vaultId, Long linkedUserId);
}
