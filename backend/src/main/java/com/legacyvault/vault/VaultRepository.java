package com.legacyvault.vault;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VaultRepository extends JpaRepository<Vault, Long> {
	Optional<Vault> findByPublicIdAndOwnerUserId(UUID publicId, Long ownerUserId);
	Optional<Vault> findFirstByOwnerUserId(Long ownerUserId);
}
