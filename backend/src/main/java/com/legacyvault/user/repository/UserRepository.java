
package com.legacyvault.user.repository;

import com.legacyvault.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository cho {@code dbo.users}. Được {@code AuthService}, các luồng khôi phục/xác minh email, và dịch vụ quản trị tài khoản
 * ({@code AdminUserQueryService}, {@code AdminUserManagementService}) sử dụng; ngoài ra nhiều module tra cứu theo {@code publicId}.
 */
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Điều kiện JPQL dùng chung xác định tài khoản "đang trong xử lý" (IN_PROCESS): có Vault ở trạng thái xử lý và người dùng có liên hệ
     * tương ứng theo role (Beneficiary được chỉ định, Staff được giao hồ sơ mở, Legal Verifier đã có hành động audit pháp lý trong hồ sơ
     * mở). Dùng chung một điều kiện để trạng thái hiển thị và bộ lọc trước phân trang luôn khớp. Cần tham số {@code :roleCode}.
     */
    String PROCESSING_RELATION = """
            exists (select v.vaultId from Vault v where v.status in (
                'AWAITING_VERIFICATION', 'DOCUMENT_VERIFICATION', 'WILL_VERIFICATION',
                'AWAITING_LEGAL_BASIS', 'LEGAL_BASIS_VERIFICATION', 'ON_HOLD', 'UNLOCKED', 'HANDOVER_IN_PROGRESS')
                and (
                    ((:roleCode is null or :roleCode = 'ROLE_BENEFICIARY')
                        and exists (select ur.id from UserRole ur join ur.role r
                            where ur.user.userId = u.userId and r.roleCode = 'ROLE_BENEFICIARY')
                        and exists (select b.id from Beneficiary b where b.vault.vaultId = v.vaultId
                            and b.linkedUserId = u.userId and b.status = 'DESIGNATED'))
                    or ((:roleCode is null or :roleCode = 'ROLE_STAFF_EXECUTOR')
                        and exists (select ur.id from UserRole ur join ur.role r
                            where ur.user.userId = u.userId and r.roleCode = 'ROLE_STAFF_EXECUTOR')
                        and exists (select c.verificationCaseId from VerificationCase c
                            where c.vaultId = v.vaultId and c.status = 'OPEN' and c.assignedStaffUserId = u.userId))
                    or ((:roleCode is null or :roleCode = 'ROLE_LEGAL_VERIFIER')
                        and exists (select ur.id from UserRole ur join ur.role r
                            where ur.user.userId = u.userId and r.roleCode = 'ROLE_LEGAL_VERIFIER')
                        and exists (select c.verificationCaseId from VerificationCase c where c.vaultId = v.vaultId
                            and c.status = 'OPEN' and exists (select a.id from AuditLog a
                                where a.vaultId = v.vaultId and a.actorUserId = u.userId and a.actorType = 'USER'
                                and a.occurredAt >= c.createdAt and (a.action in (
                                    'LEGAL_DEATH_DOCUMENT_DECIDED', 'WILL_COMPARISON_RECORDED',
                                    'LEGAL_BASIS_CLASSIFIED', 'LEGAL_BASIS_RECLASSIFIED', 'COURT_DECISION_RECORDED',
                                    'LEGAL_BASIS_HELD', 'LEGAL_BASIS_REVIEW_REQUIRED', 'LEGAL_BASIS_REVIEW_RECORDED',
                                    'LEGAL_BASIS_DECIDED', 'LEGAL_VAULT_UNLOCKED', 'DISTRIBUTION_DOCUMENTS_REQUESTED',
                                    'DISTRIBUTION_DOCUMENTS_APPROVED', 'DISTRIBUTION_DOCUMENT_SUPPLEMENTATION_REQUESTED',
                                    'DISTRIBUTION_ALLOCATIONS_APPROVED', 'DISTRIBUTION_ALLOCATION_CHANGES_REQUESTED')
                                    or (a.action = 'HANDOVER_GROUP_CHANGED' and
                                        (a.details like '%"operation":"APPROVE"%' or a.details like '%"operation":"REJECT"%'))))))
                ))
            """;

    /**
     * Trong tập id cho trước, lấy các tài khoản {@code ACTIVE} đang trong xử lý (theo {@link #PROCESSING_RELATION}); dùng để gắn
     * trạng thái IN_PROCESS khi liệt kê tài khoản cho admin.
     *
     * @param userIds  tập id nội bộ cần kiểm tra
     * @param roleCode role đang lọc ({@code ROLE_*}) hoặc {@code null}
     * @return tập id đang trong xử lý
     */
    @Query("select u.userId from User u where u.userId in :userIds and u.status = 'ACTIVE' and u.deletedAt is null and " + PROCESSING_RELATION)
    java.util.Set<Long> findProcessingUserIds(@Param("userIds") java.util.Collection<Long> userIds, @Param("roleCode") String roleCode);

    /**
     * Khóa bi quan dòng của tài khoản {@code ACTIVE} và chưa xóa; dùng trước khi ghi để tuần tự hóa mọi thay đổi trên tài khoản (đổi
     * hồ sơ, đặt mật khẩu, khôi phục, xác minh email). Phải gọi trong transaction.
     *
     * @param id id nội bộ
     * @return tài khoản nếu còn hoạt động
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.userId = :id and u.status = 'ACTIVE' and u.deletedAt is null")
    Optional<User> findActiveAccountForUpdate(@Param("id") Long id);

    /**
     * Khóa dòng cho thay đổi do admin: khác bản chỉ-ACTIVE, bản này cũng tìm thấy tài khoản {@code LOCKED} và {@code PENDING}
     * (chỉ loại tài khoản đã xóa). Dùng trong {@code AdminUserManagementService}.
     *
     * @param id id nội bộ
     * @return tài khoản chưa xóa
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.userId = :id and u.deletedAt is null")
    Optional<User> findLiveAccountForUpdate(@Param("id") Long id);

    /**
     * Kiểm tra email (đã chuẩn hóa) đã tồn tại.
     *
     * @param email email đã chuẩn hóa
     * @return {@code true} nếu đã có
     */
    boolean existsByEmail(String email);

    /**
     * Kiểm tra email đã thuộc về một tài khoản khác (dùng khi đổi email).
     *
     * @param email  email đã chuẩn hóa
     * @param userId id tài khoản được loại trừ
     * @return {@code true} nếu bị tài khoản khác dùng
     */
    boolean existsByEmailAndUserIdNot(String email, Long userId);

    /**
     * Tìm tài khoản theo email đã chuẩn hóa.
     *
     * @param email email đã chuẩn hóa
     * @return tài khoản nếu có
     */
    Optional<User> findByEmail(String email);

    /**
     * Tìm tài khoản theo mã công khai (UUID) trong API/JWT.
     *
     * @param publicId UUID công khai
     * @return tài khoản nếu có
     */
    Optional<User> findByPublicId(UUID publicId);

    /**
     * Tìm kiếm tài khoản cho trang quản trị ({@code GET /api/v1/admin/users}). Lọc theo từ khóa (họ tên, email hoặc UUID), role, trạng thái
     * (gồm {@code DELETED} theo xóa mềm, {@code IN_PROCESS} và {@code ACTIVE} loại trừ tài khoản đang xử lý theo
     * {@link #PROCESSING_RELATION}) và trạng thái Vault ({@code NO_VAULT}, {@code IN_PROCESS} hoặc trạng thái cụ thể). Các role nghiệp vụ chỉ
     * trả tài khoản {@code ACTIVE}/{@code LOCKED} chưa xóa. Dùng bởi {@code AdminUserQueryService}.
     *
     * @param query       từ khóa tìm kiếm hoặc {@code null}
     * @param hasUuid     {@code true} nếu từ khóa là UUID hợp lệ
     * @param queryUuid   UUID đã phân tích (khi {@code hasUuid})
     * @param roleCode    mã role viết hoa hoặc {@code null}
     * @param status      trạng thái lọc hoặc {@code null}
     * @param vaultStatus trạng thái Vault lọc hoặc {@code null}
     * @param pageable    phân trang và sắp xếp
     * @return một trang tài khoản
     */
    @Query("""
            select distinct u from User u
            where (:query is null or lower(u.fullName) like lower(concat('%', :query, '%'))
                   or lower(u.email) like lower(concat('%', :query, '%'))
                   or (:hasUuid = true and u.publicId = :queryUuid))
              and (:roleCode is null or exists (
                   select ur.id from UserRole ur join ur.role r
                   where ur.user.userId = u.userId and upper(r.roleCode) = :roleCode))
              and (:roleCode is null or :roleCode not in (
                   'ROLE_VAULT_OWNER', 'ROLE_BENEFICIARY', 'ROLE_LEGAL_VERIFIER', 'ROLE_STAFF_EXECUTOR')
                   or (u.deletedAt is null and u.status in ('ACTIVE', 'LOCKED')))
              and (:status is null
                   or (:status = 'DELETED' and u.deletedAt is not null)
                   or (:status not in ('ACTIVE', 'IN_PROCESS', 'DELETED') and u.deletedAt is null and upper(u.status) = :status)
                   or (:status = 'IN_PROCESS' and u.deletedAt is null and u.status = 'ACTIVE' and
            """ + PROCESSING_RELATION + """
                   )
                   or (:status = 'ACTIVE' and u.deletedAt is null and u.status = 'ACTIVE' and not
            """ + PROCESSING_RELATION + """
                   ))
              and (:vaultStatus is null
                   or (:vaultStatus = 'NO_VAULT' and not exists (
                       select v.vaultId from Vault v where v.ownerUserId = u.userId))
                   or exists (select v.vaultId from Vault v where v.ownerUserId = u.userId
                       and (v.status = :vaultStatus
                            or (:vaultStatus = 'IN_PROCESS' and v.status in (
                                'AWAITING_VERIFICATION', 'DOCUMENT_VERIFICATION', 'WILL_VERIFICATION',
                                'AWAITING_LEGAL_BASIS', 'LEGAL_BASIS_VERIFICATION', 'ON_HOLD',
                                'UNLOCKED', 'HANDOVER_IN_PROGRESS')))))
            """)
    Page<User> searchForAdmin(@Param("query") String query,
                              @Param("hasUuid") boolean hasUuid,
                              @Param("queryUuid") UUID queryUuid,
                              @Param("roleCode") String roleCode,
                              @Param("status") String status,
                              @Param("vaultStatus") String vaultStatus,
                              Pageable pageable);
}
