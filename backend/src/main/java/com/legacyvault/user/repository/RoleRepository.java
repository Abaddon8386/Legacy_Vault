package com.legacyvault.user.repository;

import com.legacyvault.user.entity.Role;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Repository cho {@code dbo.roles}.
 */
public interface RoleRepository extends JpaRepository<Role, Long> {
    /**
     * Tìm role theo mã (ví dụ {@code ROLE_VAULT_OWNER}); {@code AuthService.register} dùng để gán role mặc định.
     *
     * @param roleCode mã role
     * @return role nếu tồn tại
     */
    Optional<Role> findByRoleCode(String roleCode);
}
