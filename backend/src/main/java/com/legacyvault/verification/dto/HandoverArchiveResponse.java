package com.legacyvault.verification.dto;
import java.time.Instant;
import java.util.UUID;
public record HandoverArchiveResponse(UUID vaultId,UUID caseId,UUID sessionId,String vaultStatus,String caseStatus,Instant archivedAt) {}
