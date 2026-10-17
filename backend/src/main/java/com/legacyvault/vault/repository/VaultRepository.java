package com.legacyvault.vault.repository;

import com.legacyvault.vault.entity.Vault;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface VaultRepository extends JpaRepository<Vault, Long> {

    boolean existsByOwnerUserId(Long ownerUserId);

    Optional<Vault> findByPublicId(UUID publicId);

    /**
     * Ownership (PS-14, vaults.md): luồng của Owner luôn truy vấn theo cặp (publicId, ownerUserId),
     * không tìm theo publicId rồi mới so chủ sở hữu.
     */
    Optional<Vault> findByPublicIdAndOwnerUserId(UUID publicId, Long ownerUserId);

    Page<Vault> findByOwnerUserId(Long ownerUserId, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from Vault v where v.publicId = :publicId and v.ownerUserId = :ownerUserId")
    Optional<Vault> findOwnedVaultForUpdate(
            @Param("publicId") UUID publicId,
            @Param("ownerUserId") Long ownerUserId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
    select v from Vault v
    where v.ownerUserId = :ownerUserId
    """)
    Optional<Vault> findByOwnerUserIdForUpdate(
            @Param("ownerUserId") Long ownerUserId
    );
}