package com.legacyvault.admin;
import java.time.Instant;
import java.util.UUID;
public final class AdminAuditDtos {
    private AdminAuditDtos() {}
    public record Actor(String kind, UUID userId) {}
    public record Event(UUID id, Instant occurredAt, Actor actor, String action, String entityType, UUID vaultId) {}
    public record Detail(Event event, UUID traceId) {}
}
