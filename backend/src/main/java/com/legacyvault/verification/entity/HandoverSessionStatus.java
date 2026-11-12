package com.legacyvault.verification.entity;

/**
 * Trạng thái của {@link HandoverSession}: {@code OPEN} (đang bàn giao), {@code COMPLETED} (đã hoàn tất, có bằng chứng hoàn tất)
 * hoặc {@code CANCELLED} (đã hủy). Chỉ cho phép chuyển từ OPEN sang một trong hai trạng thái kết thúc.
 */
public enum HandoverSessionStatus {
    OPEN,
    COMPLETED,
    CANCELLED
}
