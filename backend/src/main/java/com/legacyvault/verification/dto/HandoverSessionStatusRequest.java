package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotNull;

public record HandoverSessionStatusRequest(@NotNull TerminalStatus status) {
    public enum TerminalStatus { COMPLETED, CANCELLED }
}
