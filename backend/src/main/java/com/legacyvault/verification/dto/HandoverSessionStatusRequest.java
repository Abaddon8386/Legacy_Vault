package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Body của {@code PATCH .../handover-sessions/{sessionId}/status}; chỉ cho phép chuyển sang trạng thái kết thúc {@code CANCELLED}.
 */
public record HandoverSessionStatusRequest(@NotNull TerminalStatus status) {
    /**
     * Các trạng thái kết thúc hợp lệ: chỉ {@code CANCELLED}.
     */
    public enum TerminalStatus { CANCELLED }
}
