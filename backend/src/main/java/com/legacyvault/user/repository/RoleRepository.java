package com.legacyvault.user.repository;

import com.legacyvault.user.entity.Role;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Long> {
    /**
     * Tìm role theo mã (ví dụ ROLE_VAULT_OWNER).
     */
    Optional<Role> findByRoleCode(String roleCode);
}
