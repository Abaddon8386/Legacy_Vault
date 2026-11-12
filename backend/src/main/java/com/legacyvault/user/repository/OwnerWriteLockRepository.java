package com.legacyvault.user.repository;

import com.legacyvault.user.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * Điểm tuần tự hóa dùng chung cho việc tạo Vault và mọi thao tác ghi nội dung/hạn mức của Owner ({@code VaultService} khi tạo Vault,
 * {@code OwnerQuotaService} khi ghi hạn mức): khóa dòng {@code users} của Owner nên các thay đổi phải nhất quán với nhau.
 */
public interface OwnerWriteLockRepository extends Repository<User, Long> {

    /**
     * Khóa bi quan ({@code PESSIMISTIC_WRITE}) dòng của Owner đang {@code ACTIVE} và chưa xóa. Phải gọi trong transaction.
     *
     * @param ownerUserId id nội bộ của Owner
     * @return Owner nếu còn hoạt động, ngược lại rỗng
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select u from User u
        where u.userId = :ownerUserId and u.status = 'ACTIVE' and u.deletedAt is null
        """)
    Optional<User> findActiveOwnerForUpdate(@Param("ownerUserId") Long ownerUserId);
}
