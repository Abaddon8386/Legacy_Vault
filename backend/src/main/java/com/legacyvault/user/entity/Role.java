
package com.legacyvault.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Vai trò hệ thống, bảng {@code dbo.roles}. Mã role gồm {@code ROLE_ADMIN}, {@code ROLE_VAULT_OWNER}, {@code ROLE_BENEFICIARY},
 * {@code ROLE_STAFF_EXECUTOR}, {@code ROLE_LEGAL_VERIFIER}. Gán cho người dùng qua {@link UserRole}.
 */
@Entity
@Table(name = "roles", schema = "dbo")
public class Role {

    /**
     * Khóa chính tự tăng.
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "role_id")
    private Long roleId;

    /**
     * Mã role duy nhất (có tiền tố {@code ROLE_}), dùng cho kiểm tra quyền.
     */
    @Column(name = "role_code", nullable = false, unique = true, length = 50)
    private String roleCode;

    /**
     * Tên hiển thị của role.
     */
    @Column(name = "role_name", nullable = false, length = 100)
    private String roleName;

    /**
     * Mô tả role (tùy chọn).
     */
    @Column(name = "description", length = 255)
    private String description;

    /**
     * Constructor không tham số dành cho JPA.
     */
    public Role() {
    }

    public Long getRoleId() {
        return roleId;
    }

    public String getRoleCode() {
        return roleCode;
    }

    public void setRoleCode(String roleCode) {
        this.roleCode = roleCode;
    }

    public String getRoleName() {
        return roleName;
    }

    public void setRoleName(String roleName) {
        this.roleName = roleName;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
