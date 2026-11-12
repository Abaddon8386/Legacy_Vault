
package com.legacyvault.user.repository;

import com.legacyvault.user.entity.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * Repository cho {@code dbo.user_roles}. Được {@code AuthService}, {@code JwtAuthenticationFilter} (nạp role mỗi request) và các
 * dịch vụ quản trị dùng.
 */
public interface UserRoleRepository extends JpaRepository<UserRole, UserRole.UserRoleId> {
    /**
     * Lấy các gán role của một người dùng (role nạp lười).
     *
     * @param userId id nội bộ
     * @return danh sách {@link UserRole}
     */
    List<UserRole> findByUser_UserId(Long userId);

    /**
     * Lấy các gán role của một người dùng kèm role (JOIN FETCH, tránh N+1).
     *
     * @param userId id nội bộ
     * @return danh sách {@link UserRole} đã nạp role
     */
    @Query("""
    SELECT ur
    FROM UserRole ur
    JOIN FETCH ur.role
    WHERE ur.user.userId = :userId
    """)
    List<UserRole> findByUserIdWithRole(@Param("userId") Long userId);

    /**
     * Lấy các gán role (kèm role) của nhiều người dùng trong một truy vấn; dùng khi liệt kê tài khoản cho admin.
     *
     * @param userIds danh sách id nội bộ
     * @return danh sách {@link UserRole} đã nạp role
     */
    @Query("""
    SELECT ur
    FROM UserRole ur
    JOIN FETCH ur.role
    WHERE ur.user.userId IN :userIds
    """)
    List<UserRole> findByUserIdsWithRole(@Param("userIds") List<Long> userIds);
}
