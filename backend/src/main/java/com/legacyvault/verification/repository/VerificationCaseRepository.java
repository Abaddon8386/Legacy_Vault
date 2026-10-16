package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.VerificationCase;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VerificationCaseRepository extends JpaRepository<VerificationCase, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select c from VerificationCase c
        where c.vaultId = :vaultId
        order by c.openedAt desc
        """)
    List<VerificationCase> findByVaultIdForUpdate(@Param("vaultId") Long vaultId);

    boolean existsByVaultIdAndStatus(Long vaultId, String status);

    @Query("""
    select c from VerificationCase c
    where c.assignedStaffUserId = :staffUserId
      and (:status is null or c.status = :status)
    """)
    Page<VerificationCase> findQueueByStaff(
            @Param("staffUserId") Long staffUserId,
            @Param("status") String status,
            Pageable pageable
    );

    Optional<VerificationCase> findByPublicIdAndAssignedStaffUserId(
            UUID publicId,
            Long assignedStaffUserId
    );
}