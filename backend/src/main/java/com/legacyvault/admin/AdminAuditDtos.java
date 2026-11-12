package com.legacyvault.admin;
import java.time.Instant;
import java.util.UUID;
/**
 * Các record (DTO) trả về cho API {@code /api/v1/admin/audit-logs}. Class chỉ là "vỏ" gom nhóm nên không khởi tạo được.
 * Chỉ chứa id công khai (publicId/UUID); tuyệt đối không có email, IP, id nội bộ hay nội dung trạng thái trước/sau.
 */
public final class AdminAuditDtos {
    /** Ngăn khởi tạo: class chỉ dùng làm namespace cho các record bên trong. */
    private AdminAuditDtos() {}
    /** name: current full name, only for an existing account (kind USER); never an email. */
    public record Actor(String kind, UUID userId, String role, String name) {}
    /** caseId/caseNumber/staffId: the case opened for this vault at or before the event; ownerId: the vault owner. All public ids. */
    public record Event(UUID id, Instant occurredAt, Actor actor, String action, String entityType, UUID vaultId,
            UUID ownerId, UUID caseId, String caseNumber, UUID staffId) {}
    /** Response của {@code GET /audit-logs/{id}}: sự kiện kèm {@code traceId} dùng để đối chiếu với log hệ thống. */
    public record Detail(Event event, UUID traceId) {}
}
