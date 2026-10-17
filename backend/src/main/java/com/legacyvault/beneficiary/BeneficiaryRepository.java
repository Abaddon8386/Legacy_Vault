package com.legacyvault.beneficiary;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BeneficiaryRepository extends JpaRepository<Beneficiary, Long> {
	Page<Beneficiary> findAllByVault_VaultId(Long vaultId, Pageable pageable);
	long countByVault_VaultId(Long vaultId);
	Optional<Beneficiary> findByPublicIdAndVault_VaultId(UUID publicId, Long vaultId);
	Optional<Beneficiary> findByPublicId(UUID publicId);
	boolean existsByPublicId(UUID publicId);
}
