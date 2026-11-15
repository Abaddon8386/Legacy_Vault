
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

public interface UserRepository extends JpaRepository<User, Long> {

    // Một điều kiện duy nhất giúp trạng thái hiển thị và bộ lọc trước phân trang nhất quán.
    /**
     * Điều kiện JPQL "đang tham gia quy trình hậu sự" (trạng thái IN_PROCESS của tài khoản), dùng chung cho hiển thị và lọc để kết quả trước/sau phân trang nhất quán.
     * Một user được coi là đang xử lý nếu có Vault ở trạng thái hậu sự và thỏa một trong ba quan hệ:
     * <ul><li>Beneficiary: người thụ hưởng DESIGNATED của Vault đó, liên kết với user;</li>
     * <li>Staff: được gán vào Verification Case đang OPEN của Vault;</li>
     * <li>Legal: đã thực hiện một hành động pháp lý (theo audit) kể từ khi case OPEN được tạo, gồm cả duyệt/từ chối HANDOVER_GROUP_CHANGED.</li></ul>
     * Tham số {@code :roleCode} (null nghĩa là xét mọi role) thu hẹp quan hệ theo role đang lọc.
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
     * Trong danh sách userIds, trả về các tài khoản ACTIVE (chưa xóa) đang ở trạng thái xử lý theo {@link #PROCESSING_RELATION}.
     */
    @Query("select u.userId from User u where u.userId in :userIds and u.status = 'ACTIVE' and u.deletedAt is null and " + PROCESSING_RELATION)
    java.util.Set<Long> findProcessingUserIds(@Param("userIds") java.util.Collection<Long> userIds, @Param("roleCode") String roleCode);

    /**
     * Khóa ghi (SELECT FOR UPDATE) dòng user ACTIVE chưa xóa; dùng để tuần tự hóa các thao tác ghi của chủ sở hữu trên cùng một user.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.userId = :id and u.status = 'ACTIVE' and u.deletedAt is null")
    Optional<User> findActiveAccountForUpdate(@Param("id") Long id);

    /** Khóa dòng cho các thay đổi trạng thái của admin; khác bản chỉ ACTIVE, bản này tìm cả tài khoản LOCKED và PENDING. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.userId = :id and u.deletedAt is null")
    Optional<User> findLiveAccountForUpdate(@Param("id") Long id);

    boolean existsByEmail(String email);

    boolean existsByEmailAndUserIdNot(String email, Long userId);

    Optional<User> findByEmail(String email);

    Optional<User> findByPublicId(UUID publicId);

    /**
     * Tìm kiếm tài khoản cho Admin; lọc xong mới phân trang nên tổng số và trang nhất quán.
     *
     * <ul><li>{@code query}: khớp một phần tên hoặc email (không phân biệt hoa thường); nếu {@code hasUuid} thì khớp thêm public ID chính xác;</li>
     * <li>{@code roleCode}: có role đó; với role nghiệp vụ chỉ lấy tài khoản ACTIVE/LOCKED chưa xóa;</li>
     * <li>{@code status}: DELETED theo deletedAt; IN_PROCESS là ACTIVE và đang xử lý; ACTIVE là ACTIVE và không đang xử lý; còn lại so trực tiếp với status;</li>
     * <li>{@code vaultStatus}: NO_VAULT (chưa có Vault), IN_PROCESS (nhóm trạng thái hậu sự) hoặc trạng thái Vault khớp chính xác.</li></ul>
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
