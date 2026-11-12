package com.legacyvault.audit;

/**
 * Loại tác nhân thực hiện hành động được audit (cột {@code audit_logs.actor_type}).
 *
 * <ul>
 *   <li>{@code USER}: người dùng đăng nhập thực hiện, bắt buộc có {@code actorUserId} (trừ
 *       {@code AUTH_LOGIN_FAILED});</li>
 *   <li>{@code SYSTEM}: tiến trình hệ thống thực hiện (ví dụ xác nhận kết quả thanh toán, phát hành mã khôi phục /
 *       xác minh email, job DMS quét định kỳ ghi audit với actor {@code SYSTEM}).</li>
 * </ul>
 */
public enum AuditActorType {
    USER,
    SYSTEM
}