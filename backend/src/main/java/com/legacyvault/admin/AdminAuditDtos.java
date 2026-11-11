package com.legacyvault.admin;
import java.time.Instant;
import java.util.UUID;
public final class AdminAuditDtos {
    private AdminAuditDtos() {}
    /** name: current full name, only for an existing account (kind USER); never an email. */
    public record Actor(String kind, UUID userId, String role, String name) {}
    /** caseId/caseNumber/staffId: the case opened for this vault at or before the event; ownerId: the vault owner. All public ids. */
    public record Event(UUID id, Instant occurredAt, Actor actor, String action, String entityType, UUID vaultId,
            UUID ownerId, UUID caseId, String caseNumber, UUID staffId) {}
    public record Detail(Event event, UUID traceId) {}
}
