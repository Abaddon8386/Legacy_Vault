package com.legacyvault.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Repository Spring Data JPA cho {@link AuditLog} (bảng {@code audit_logs}).
 *
 * <p>Ngoài CRUD mặc định, được {@code AuditService} dùng để lưu sự kiện và {@code PasswordReauthService} dùng để
 * đếm số lần nhập sai mật khẩu xác nhận.
 */
@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    /**
     * Đếm số sự kiện của một người dùng với một hành động kể từ một thời điểm (UTC) — dùng để đếm số lần
     * nhập sai mật khẩu xác nhận trong cửa sổ giới hạn ({@code PasswordReauthService.requirePassword}).
     *
     * @param actorUserId id người thực hiện
     * @param action      tên {@link AuditAction}, ví dụ {@code REAUTH_FAILED}
     * @param since       mốc thời gian bắt đầu (UTC)
     * @return số dòng audit khớp
     */
    long countByActorUserIdAndActionAndOccurredAtAfter(Long actorUserId, String action, java.time.LocalDateTime since);
}