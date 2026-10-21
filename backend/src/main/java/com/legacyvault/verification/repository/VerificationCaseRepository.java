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

    /**
     * PS-88: same visibility scope as {@link #findQueueByStaff}, narrowed by a search term (Vault, owner or
     * Beneficiary name, case reference, public UUID).
     * LIKE uses '!' as escape so user input never acts as a wildcard; unused sentinel
     * arguments (caseId -1, year -1, zero UUID) never match a real row.
     */
    @Query("""
    select c from VerificationCase c
    where (
        c.assignedStaffUserId = :staffUserId
        or (c.assignedStaffUserId is null and c.status = 'OPEN')
    )
    and (:status is null or c.status = :status)
    and (
        c.publicId = :publicId
        or (c.verificationCaseId = :caseId and extract(year from c.createdAt) = :year)
        or exists (select 1 from Vault v where v.vaultId = c.vaultId
                   and (v.publicId = :publicId or lower(v.name) like :pattern escape '!'))
        or exists (select 1 from Vault v, User u where v.vaultId = c.vaultId
                   and u.userId = v.ownerUserId and lower(u.fullName) like :pattern escape '!')
        or exists (select 1 from Beneficiary b where b.vault.vaultId = c.vaultId
                   and lower(b.fullName) like :pattern escape '!')
    )
    """)
    Page<VerificationCase> searchQueueByStaff(
            @Param("staffUserId") Long staffUserId,
            @Param("status") String status,
            @Param("pattern") String pattern,
            @Param("publicId") UUID publicId,
            @Param("caseId") long caseId,
            @Param("year") int year,
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