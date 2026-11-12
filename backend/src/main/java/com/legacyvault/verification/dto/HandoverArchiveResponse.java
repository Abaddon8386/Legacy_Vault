package com.legacyvault.verification.dto;
import java.time.Instant;
import java.util.UUID;
/**
 * Kết quả của {@code POST .../handover-sessions/{sessionId}/archive}: UUID vault/ca/phiên, trạng thái vault và ca sau khi lưu trữ, và {@code archivedAt}.
 */
public record HandoverArchiveResponse(UUID vaultId,UUID caseId,UUID sessionId,String vaultStatus,String caseStatus,Instant archivedAt) {}
