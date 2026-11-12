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
    /** Người thực hiện: {@code kind} là SYSTEM/USER/DELETED_USER/UNKNOWN; {@code name} là họ tên hiện tại, chỉ có khi kind là USER (tài khoản còn tồn tại), không bao giờ là email. */
    public record Actor(String kind, UUID userId, String role, String name) {}
    /** Một dòng nhật ký: caseId/caseNumber/staffId thuộc hồ sơ xác minh gần nhất được mở cho vault tại hoặc trước thời điểm sự kiện (null nếu chưa có); ownerId là chủ vault. Tất cả là id công khai. */
    public record Event(UUID id, Instant occurredAt, Actor actor, String action, String entityType, UUID vaultId,
            UUID ownerId, UUID caseId, String caseNumber, UUID staffId) {}
    /** Response của {@code GET /audit-logs/{id}}: sự kiện kèm {@code traceId} dùng để đối chiếu với log hệ thống. */
    public record Detail(Event event, UUID traceId) {}
}
