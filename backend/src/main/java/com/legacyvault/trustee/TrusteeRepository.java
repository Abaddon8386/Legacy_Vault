package com.legacyvault.trustee;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TrusteeRepository extends JpaRepository<Trustee, Long> {
	Optional<Trustee> findFirstByVault_IdAndStatus(Long vaultId, String status);
	boolean existsByVault_IdAndStatus(Long vaultId, String status);
	Optional<Trustee> findByPublicIdAndVault_OwnerUserId(UUID publicId, Long ownerUserId);
	Optional<Trustee> findByPublicId(UUID publicId);
	boolean existsByPublicId(UUID publicId);
}
