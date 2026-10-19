package com.legacyvault.verification.dto;
import java.time.Instant;
import java.util.UUID;
public record HandoverCloseResponse(UUID sessionId,String status,Instant closedAt) {}
