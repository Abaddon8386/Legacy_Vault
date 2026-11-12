package com.legacyvault.audit;

/**
 * Loại tác nhân thực hiện hành động được audit (cột {@code audit_logs.actor_type}).
 *
 * <ul>
 *   <li>{@code USER}: người dùng đăng nhập thực hiện, bắt buộc có {@code actorUserId} (trừ
 *       {@code AUTH_LOGIN_FAILED});</li>
 *   <li>{@code SYSTEM}: tiến trình hệ thống (ví dụ job DMS quét định kỳ, webhook thanh toán).</li>
 * </ul>
 */
public enum AuditActorType {
    USER,
    SYSTEM
}