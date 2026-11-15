
package com.legacyvault.user.repository;

import com.legacyvault.user.entity.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface UserRoleRepository extends JpaRepository<UserRole, UserRole.UserRoleId> {
    List<UserRole> findByUser_UserId(Long userId);

    /**
     * Lấy các liên kết role của một user, JOIN FETCH role để tránh N+1 và lỗi lazy; dùng khi nạp authority ở mỗi request.
     */
    @Query("""
    SELECT ur
    FROM UserRole ur
    JOIN FETCH ur.role
    WHERE ur.user.userId = :userId
    """)
    List<UserRole> findByUserIdWithRole(@Param("userId") Long userId);

    @Query("""
    SELECT ur
    FROM UserRole ur
    JOIN FETCH ur.role
    WHERE ur.user.userId IN :userIds
    """)
    List<UserRole> findByUserIdsWithRole(@Param("userIds") List<Long> userIds);
}
