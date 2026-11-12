package com.legacyvault.verification.dto;

import com.legacyvault.verification.entity.HandoverSessionStatus;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Phiên bàn giao. Các trường: {@code sessionId}, {@code caseId}, {@code vaultId}, {@code staffId},
 * {@code status}, {@code openedAt}, {@code closedAt}.
 */
public record HandoverSessionResponse(
        UUID sessionId,
        UUID caseId,
        UUID vaultId,
        UUID staffId,
        HandoverSessionStatus status,
        LocalDateTime openedAt,
        LocalDateTime closedAt
) {}
