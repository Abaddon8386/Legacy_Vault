
package com.legacyvault.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import jakarta.persistence.Temporal;
import jakarta.persistence.TemporalType;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

/**
 * Quan hệ nhiều-nhiều giữa {@link User} và {@link Role}, bảng {@code dbo.user_roles}, khóa chính ghép {@link UserRoleId}.
 * Role được nạp từ DB ở mỗi request bởi {@code JwtAuthenticationFilter}, nên đổi role có hiệu lực ngay.
 */
@Entity
@Table(name = "user_roles", schema = "dbo")
public class UserRole {

    /**
     * Khóa ghép (user_id, role_id).
     */
    @EmbeddedId
    private UserRoleId id;

    /**
     * Người dùng được gán role (khóa ghép lấy qua {@code @MapsId}).
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId("userId")
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /**
     * Role được gán.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId("roleId")
    @JoinColumn(name = "role_id", nullable = false)
    private Role role;

    /**
     * Id người gán role (ví dụ admin); {@code null} nếu do hệ thống tự gán.
     */
    @Column(name = "assigned_by_user_id")
    private Long assignedByUserId;

    /**
     * Thời điểm gán (UTC).
     */
    @Column(name = "assigned_at", nullable = false, updatable = false)
    private LocalDateTime assignedAt;

    /**
     * Constructor không tham số dành cho JPA.
     */
    public UserRole() {
    }

    /**
     * Gán {@code role} cho {@code user} và dựng khóa ghép từ id của hai bên (user và role phải đã được lưu).
     *
     * @param user người dùng
     * @param role role cần gán
     */
    public UserRole(User user, Role role) {
        this.user = user;
        this.role = role;
        this.id = new UserRoleId(user.getUserId(), role.getRoleId());
    }

    /**
     * Trước khi lưu: đặt {@code assignedAt} là giờ UTC nếu chưa có.
     */
    @jakarta.persistence.PrePersist
    protected void onCreate() {
        if (assignedAt == null) {
            assignedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public UserRoleId getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public Role getRole() {
        return role;
    }

    public Long getAssignedByUserId() {
        return assignedByUserId;
    }

    public void setAssignedByUserId(Long assignedByUserId) {
        this.assignedByUserId = assignedByUserId;
    }

    public LocalDateTime getAssignedAt() {
        return assignedAt;
    }

    /**
     * Khóa chính ghép của {@link UserRole}: (user_id, role_id); cài {@code equals}/{@code hashCode} theo cả hai thành phần.
     */
    @Embeddable
    public static class UserRoleId implements Serializable {

        @Column(name = "user_id")
        private Long userId;

        @Column(name = "role_id")
        private Long roleId;

        public UserRoleId() {
        }

        public UserRoleId(Long userId, Long roleId) {
            this.userId = userId;
            this.roleId = roleId;
        }

        public Long getUserId() {
            return userId;
        }

        public Long getRoleId() {
            return roleId;
        }

        @Override
        public boolean equals(Object object) {
            if (this == object) {
                return true;
            }
            if (!(object instanceof UserRoleId that)) {
                return false;
            }
            return Objects.equals(userId, that.userId)
                    && Objects.equals(roleId, that.roleId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, roleId);
        }
    }
}
