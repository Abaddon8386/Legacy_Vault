package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Yêu cầu đóng phiên bàn giao; hiện chỉ cho phép chuyển sang CANCELLED.
 */
public record HandoverSessionStatusRequest(@NotNull TerminalStatus status) {
    public enum TerminalStatus { CANCELLED }
}
