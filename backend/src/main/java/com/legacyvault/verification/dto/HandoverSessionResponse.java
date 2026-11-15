package com.legacyvault.verification.dto;

import com.legacyvault.verification.entity.HandoverSessionStatus;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Phản hồi phiên bàn giao: trạng thái OPEN/COMPLETED/CANCELLED và thời điểm mở/đóng.
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
