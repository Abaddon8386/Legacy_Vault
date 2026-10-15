package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.VerificationCase;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface VerificationCaseRepository extends JpaRepository<VerificationCase, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select c from VerificationCase c
        where c.vaultId = :vaultId
        order by c.openedAt desc
        """)
    List<VerificationCase> findByVaultIdForUpdate(@Param("vaultId") Long vaultId);

    boolean existsByVaultIdAndStatus(Long vaultId, String status);
}