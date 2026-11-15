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

    /**
     * Khóa ghi bi quan các ca của Vault (mới nhất trước); dùng để tuần tự hóa các thao tác trên ca theo Vault.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select c from VerificationCase c
        where c.vaultId = :vaultId
        order by c.openedAt desc
        """)
    List<VerificationCase> findByVaultIdForUpdate(@Param("vaultId") Long vaultId);

    /**
     * Vault có ca ở trạng thái này không.
     */
    boolean existsByVaultIdAndStatus(Long vaultId, String status);

    // Hàng đợi của Staff: ca đã giao cho mình, hoặc ca OPEN chưa có người nhận (để có thể claim). Tham số status null nghĩa là không lọc.
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
     * PS-88: cùng phạm vi hiển thị với {@link #findQueueByStaff}, thu hẹp bằng từ khóa tìm kiếm (Vault, tên chủ hoặc
     * người thụ hưởng, mã hồ sơ, UUID công khai).
     * LIKE dùng '!' làm ký tự escape để đầu vào người dùng không bao giờ thành wildcard; các tham số
     * sentinel không dùng (caseId -1, year -1, UUID toàn 0) không bao giờ khớp dòng thật.
     */
    // Tìm kiếm trong cùng phạm vi hiển thị ở trên: khớp public UUID của ca/Vault, mã ca (id + năm tạo), tên Vault, tên chủ Vault hoặc tên người thụ hưởng.
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

    /**
     * Ca theo public UUID và đúng Staff được giao (dùng cho thao tác của Staff).
     */
    Optional<VerificationCase> findByPublicIdAndAssignedStaffUserId(
            UUID publicId,
            Long assignedStaffUserId
    );

    // Ca Staff được xem: đã giao cho mình hoặc đang OPEN chưa có người nhận.
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

    /**
     * Nhận ca bằng một UPDATE có điều kiện (chưa giao, trạng thái OPEN): nếu hai Staff cùng nhận, chỉ một người cập nhật được 1 dòng.
     * @return số dòng cập nhật (1 = thành công, 0 = đã có người nhận hoặc ca không còn OPEN)
     */
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

    /**
     * Khóa ghi bi quan ca theo khóa nội bộ; trong luồng chuẩn phải gọi sau khi đã khóa Vault.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
    select c from VerificationCase c
    where c.verificationCaseId = :caseId
    """)
    Optional<VerificationCase> findByIdForUpdate(
            @Param("caseId") Long caseId
    );

    /**
     * Ca theo public UUID, không khóa và không ràng buộc Staff.
     */
    Optional<VerificationCase> findByPublicId(UUID publicId);

}