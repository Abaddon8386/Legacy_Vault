package com.legacyvault.verification.dto;
import java.time.Instant;
import java.util.UUID;
/**
 * Kết quả của {@code POST .../handover-sessions/{sessionId}/close}: phiên, trạng thái mới và thời điểm đóng.
 */
public record HandoverCloseResponse(UUID sessionId,String status,Instant closedAt) {}
