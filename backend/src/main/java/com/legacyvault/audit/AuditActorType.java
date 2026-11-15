package com.legacyvault.audit;

/**
 * Loại tác nhân tạo sự kiện audit: người dùng ({@code USER}) hoặc hệ thống/tiến trình tự động ({@code SYSTEM}).
 */
public enum AuditActorType {
    USER,
    SYSTEM
}