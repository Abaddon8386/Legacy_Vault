package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.VerificationCase;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
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
    where (
        c.assignedStaffUserId = :staffUserId
        or (c.assignedStaffUserId is null and c.status = 'OPEN')
    )
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

    @Query("""
    select c from VerificationCase c
    where c.publicId = :publicId
      and (
          (c.assignedStaffUserId is null and c.status = 'OPEN')
          or c.assignedStaffUserId = :staffUserId
      )
    """)
    Optional<VerificationCase> findViewableCaseByPublicId(
            @Param("publicId") UUID publicId,
            @Param("staffUserId") Long staffUserId
    );

    @Modifying
    @Query("""
    update VerificationCase c
    set c.assignedStaffUserId = :staffUserId,
        c.updatedAt = CURRENT_TIMESTAMP
    where c.publicId = :caseId
        and c.assignedStaffUserId is null
        and c.status = 'OPEN'
    """)
    int claimUnassignedCase(
            @Param("caseId") UUID caseId,
            @Param("staffUserId") Long staffUserId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
    select c from VerificationCase c
    where c.verificationCaseId = :caseId
    """)
    Optional<VerificationCase> findByIdForUpdate(
            @Param("caseId") Long caseId
    );

    Optional<VerificationCase> findByPublicId(UUID publicId);

}