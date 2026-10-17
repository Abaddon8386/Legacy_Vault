package com.legacyvault.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    /** Đếm sự kiện của một người dùng từ một thời điểm (UTC) — dùng để giới hạn số lần nhập sai mật khẩu. */
    long countByActorUserIdAndActionAndOccurredAtAfter(Long actorUserId, String action, java.time.LocalDateTime since);
}