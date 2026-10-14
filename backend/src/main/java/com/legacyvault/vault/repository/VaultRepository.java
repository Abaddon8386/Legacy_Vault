package com.legacyvault.vault.repository;

import com.legacyvault.vault.entity.Vault;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface VaultRepository extends JpaRepository<Vault, Long> {

    boolean existsByOwnerUserId(Long ownerUserId);

    Optional<Vault> findByPublicId(UUID publicId);
}