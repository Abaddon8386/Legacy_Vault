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

/**
 * Bảng {@code verification_cases}. Dùng bởi {@code StaffVerificationCaseService} (hàng đợi, nhận ca) và nhiều dịch vụ khác.
 */
public interface VerificationCaseRepository extends JpaRepository<VerificationCase, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select c from VerificationCase c
        where c.vaultId = :vaultId
        order by c.openedAt desc
        """)
    /**
     * Các ca của vault, khóa ghi bi quan, mới mở trước.
     */
    List<VerificationCase> findByVaultIdForUpdate(@Param("vaultId") Long vaultId);

    /**
     * True nếu vault có ca ở trạng thái {@code status}.
     */
    boolean existsByVaultIdAndStatus(Long vaultId, String status);

    @Query("""
    select c from VerificationCase c
    where (
        c.assignedStaffUserId = :staffUserId
        or (c.assignedStaffUserId is null and c.status = 'OPEN')
    )
    and (:status is null or c.status = :status)
    """)
    /**
     * Hàng đợi của Staff: ca đã giao cho Staff hoặc ca OPEN chưa ai nhận, lọc tùy chọn theo trạng thái.
     */
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
    /**
     * Có phạm vi hiển thị như {@link #findQueueByStaff}, kèm tìm kiếm theo UUID, số hồ sơ + năm, tên vault, tên chủ, tên người thụ hưởng.
     */
    Page<VerificationCase> searchQueueByStaff(
            @Param("staffUserId") Long staffUserId,
            @Param("status") String status,
            @Param("pattern") String pattern,
            @Param("publicId") UUID publicId,
            @Param("caseId") long caseId,
            @Param("year") int year,
            Pageable pageable
    );

    /**
     * Ca theo UUID công khai đã giao đúng Staff.
     */
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
    /**
     * Ca Staff được xem: ca OPEN chưa giao hoặc đã giao cho chính Staff.
     */
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
    /**
     * UPDATE nguyên tử gán ca OPEN chưa ai nhận cho Staff.
     *
     * @return 1 nếu nhận được, 0 nếu đã bị người khác nhận hoặc không còn OPEN
     */
    int claimUnassignedCase(
            @Param("caseId") UUID caseId,
            @Param("staffUserId") Long staffUserId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
    select c from VerificationCase c
    where c.verificationCaseId = :caseId
    """)
    /**
     * Ca theo khóa nội bộ, khóa ghi bi quan.
     */
    Optional<VerificationCase> findByIdForUpdate(
            @Param("caseId") Long caseId
    );

    /**
     * Ca theo UUID công khai (không kiểm quyền).
     */
    Optional<VerificationCase> findByPublicId(UUID publicId);

}