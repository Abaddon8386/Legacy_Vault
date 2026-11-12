package com.legacyvault.vault.repository;

import com.legacyvault.vault.entity.Vault;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository Spring Data JPA cho {@link Vault} (bảng {@code vaults}). Được {@code VaultService}, các service tài sản,
 * di chúc, người thụ hưởng, DMS, xác minh và bàn giao sử dụng. Các truy vấn "ForUpdate" dùng khóa ghi bi quan
 * ({@code PESSIMISTIC_WRITE}) để tuần tự hóa các thay đổi trên cùng một két.
 */
public interface VaultRepository extends JpaRepository<Vault, Long> {

    /** Kiểm tra chủ sở hữu đã có két chưa (mỗi chủ chỉ được một két). */
    boolean existsByOwnerUserId(Long ownerUserId);

    /** Kiểm tra chủ sở hữu có két đang ở một trong các trạng thái đã cho. */
    boolean existsByOwnerUserIdAndStatusIn(Long ownerUserId, java.util.Collection<String> statuses);

    /** Lấy các két của nhiều chủ sở hữu cùng lúc. */
    java.util.List<Vault> findByOwnerUserIdIn(java.util.Collection<Long> ownerUserIds);

    /** Tìm két theo UUID công khai (không kiểm tra chủ sở hữu, chỉ dùng cho luồng nội bộ/nhân viên). */
    Optional<Vault> findByPublicId(UUID publicId);

    /**
     * Ownership (PS-14, vaults.md): luồng của Owner luôn truy vấn theo cặp (publicId, ownerUserId),
     * không tìm theo publicId rồi mới so chủ sở hữu.
     *
     * @param publicId    UUID công khai của két
     * @param ownerUserId id chủ sở hữu
     * @return két nếu đúng chủ, rỗng nếu không tồn tại hoặc của người khác
     */
    Optional<Vault> findByPublicIdAndOwnerUserId(UUID publicId, Long ownerUserId);

    /** Danh sách két của một chủ sở hữu theo trang (dùng cho API liệt kê và để lấy két đầu tiên của chủ). */
    Page<Vault> findByOwnerUserId(Long ownerUserId, Pageable pageable);

    /**
     * Tìm két theo (publicId, chủ sở hữu) và khóa ghi dòng; dùng khi sửa nội dung két hoặc hủy cảnh báo.
     *
     * @param publicId    UUID công khai của két
     * @param ownerUserId id chủ sở hữu
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from Vault v where v.publicId = :publicId and v.ownerUserId = :ownerUserId")
    Optional<Vault> findOwnedVaultForUpdate(
            @Param("publicId") UUID publicId,
            @Param("ownerUserId") Long ownerUserId
    );

    /**
     * Tìm két của một chủ sở hữu và khóa ghi dòng. Job DMS dùng truy vấn này để khóa két trước rồi mới khóa DMS
     * (cùng thứ tự với luồng hủy cảnh báo) nhằm tránh deadlock.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
    select v from Vault v
    where v.ownerUserId = :ownerUserId
    """)
    Optional<Vault> findByOwnerUserIdForUpdate(
            @Param("ownerUserId") Long ownerUserId
    );

    /** Tìm két theo khóa chính nội bộ và khóa ghi dòng, dùng trong các luồng xử lý nghiệp vụ nhân viên/bàn giao. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from Vault v where v.vaultId = :vaultId")
    Optional<Vault> findByIdForUpdate(@Param("vaultId") Long vaultId);
}
