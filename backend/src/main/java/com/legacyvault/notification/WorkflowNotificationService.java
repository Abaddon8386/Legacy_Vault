package com.legacyvault.notification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

/**
 * Dịch vụ thông báo luồng nghiệp vụ giữa Staff và Legal, lưu bằng JDBC thuần.
 * <p>
 * Bảng dùng: {@code dbo.workflow_notifications} (mỗi thông báo gắn một ca xác minh, một workspace, người nhận, hành động,
 * {@code event_key} duy nhất theo ca để chống ghi trùng) và {@code dbo.workflow_notification_reads} (ai đã đọc thông báo nào);
 * đọc thêm {@code dbo.verification_cases}. Các service nghiệp vụ trong gói verification gọi {@link #record} ngay trong
 * transaction của chính chúng; {@code WorkflowNotificationController} gọi {@link #list} và {@link #markRead}.
 */
@Service
public class WorkflowNotificationService {
    /**
     * Không gian làm việc nhận thông báo: {@code STAFF} (thông báo riêng cho Staff được giao ca) hoặc {@code LEGAL} (dùng chung cho mọi Legal Verifier).
     */
    public enum Workspace { STAFF, LEGAL }
    /**
     * Một dòng thông báo trả về cho giao diện.
     * @param id         mã công khai của thông báo
     * @param caseId     mã công khai (UUID) của ca xác minh
     * @param caseNumber mã hiển thị của ca dạng {@code HS-yyyy-nnnnnn}
     * @param action     mã hành động nghiệp vụ gây ra thông báo (chữ hoa và dấu gạch dưới)
     * @param reason     lý do/ghi chú kèm theo, có thể null
     * @param occurredAt thời điểm phát sinh (UTC)
     * @param read       người dùng hiện tại đã đọc hay chưa
     */
    public record Item(UUID id, UUID caseId, String caseNumber, String action, String reason,
                       Instant occurredAt, boolean read) {}
    /**
     * Kết quả đánh dấu đã đọc.
     * @param id   mã công khai của thông báo
     * @param read luôn {@code true}
     */
    public record ReadReceipt(UUID id, boolean read) {}
    /**
     * Biên nhận ghi thông báo, dùng để service gọi biết thông báo đã tồn tại/được ghi.
     * @param id                 mã công khai của thông báo
     * @param recipientWorkspace workspace nhận
     * @param status             luôn {@code "RECORDED"}
     */
    public record Receipt(UUID id, Workspace recipientWorkspace, String status) {}
    /**
     * Truy cập SQL trực tiếp cho hai bảng thông báo.
     */
    private final JdbcTemplate jdbc;
    /**
     * Repository ca xác minh, dùng để khóa ca (PESSIMISTIC) khi ghi thông báo.
     */
    private final VerificationCaseRepository cases;
    /**
     * Khởi tạo service.
     * @param jdbc  {@link JdbcTemplate} thao tác bảng thông báo
     * @param cases repository {@link VerificationCase}
     */
    public WorkflowNotificationService(JdbcTemplate jdbc, VerificationCaseRepository cases) {
        this.jdbc = jdbc;
        this.cases = cases;
    }

    // The case lock serializes retries; notification persistence participates in the business transaction.
    /**
     * Ghi một thông báo cho một ca xác minh. Bắt buộc chạy trong transaction nghiệp vụ đang mở (MANDATORY) để thông báo và nghiệp vụ cùng commit/rollback.
     * <p>
     * Các bước: kiểm tra {@code action} khớp {@code [A-Z_]{1,80}}, {@code eventKey} không rỗng và dài tối đa 160, {@code reason} tối đa 1000 ký tự;
     * khóa dòng ca bằng {@code findByIdForUpdate} (tuần tự hóa các lần retry); nếu người nhận là STAFF mà ca chưa giao Staff nào thì bỏ qua (trả null);
     * tìm thông báo cũ theo ({@code case_id}, {@code event_key}) và chỉ INSERT khi chưa có (idempotent).
     * @param c         ca xác minh phát sinh thông báo
     * @param recipient workspace nhận
     * @param action    mã hành động
     * @param eventKey  khóa sự kiện duy nhất trong ca
     * @param reason    lý do (có thể null)
     * @return {@link Receipt}, hoặc null nếu không có Staff được giao
     * @throws IllegalArgumentException dữ liệu thông báo không hợp lệ
     * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND} khi ca không tồn tại
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Receipt record(VerificationCase c, Workspace recipient, String action, String eventKey, String reason) {
        if (action == null || !action.matches("[A-Z_]{1,80}") || eventKey == null
                || eventKey.isBlank() || eventKey.length() > 160 || (reason != null && reason.length() > 1000))
            throw new IllegalArgumentException("Invalid notification event");
        var locked = cases.findByIdForUpdate(c.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (recipient == Workspace.STAFF && locked.getAssignedStaffUserId() == null) return null;
        var existing = jdbc.queryForList("SELECT public_id FROM dbo.workflow_notifications WHERE case_id=? AND event_key=?",
                String.class, c.getVerificationCaseId(), eventKey);
        UUID id;
        if (existing.isEmpty()) {
            id = UUID.randomUUID();
            jdbc.update("INSERT INTO dbo.workflow_notifications(public_id,case_id,workspace,recipient_user_id,action,event_key,reason) VALUES(?,?,?,?,?,?,?)",
                    id.toString(), c.getVerificationCaseId(), recipient.name(),
                    recipient == Workspace.STAFF ? locked.getAssignedStaffUserId() : null, action, eventKey, reason);
        } else id = UUID.fromString(existing.get(0));
        return new Receipt(id, recipient, "RECORDED");
    }

    /**
     * Tra thông báo đã ghi theo ca và khóa sự kiện (không tạo mới).
     * @param caseId   khóa chính nội bộ của ca xác minh
     * @param eventKey khóa sự kiện
     * @return {@link Receipt} nếu đã có, ngược lại null
     */
    @Transactional(readOnly = true)
    public Receipt existing(long caseId, String eventKey) {
        var rows = jdbc.query("SELECT public_id,workspace FROM dbo.workflow_notifications WHERE case_id=? AND event_key=?",
                (rs, row) -> new Receipt(UUID.fromString(rs.getString("public_id")),
                        Workspace.valueOf(rs.getString("workspace")), "RECORDED"), caseId, eventKey);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * Liệt kê tối đa 50 thông báo mới nhất cho người dùng (phục vụ {@code GET /api/v1/workflow-notifications}).
     * <p>
     * Phạm vi nhìn thấy: workspace LEGAL thấy tất cả thông báo LEGAL; workspace STAFF chỉ thấy thông báo gửi cho chính mình
     * và thuộc ca đang được giao cho mình. Cờ {@code read} suy ra từ bảng {@code workflow_notification_reads}. Sắp xếp theo thời điểm giảm dần.
     * @param userId    id người dùng hiện tại
     * @param workspace workspace cần xem
     * @return danh sách {@link Item}
     */
    @Transactional(readOnly = true)
    public List<Item> list(long userId, Workspace workspace) {
        return jdbc.query("""
            SELECT TOP (50) n.public_id,c.public_id AS case_public_id,c.verification_case_id,c.created_at,
                   n.action,n.reason,n.occurred_at,
                   CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS is_read
            FROM dbo.workflow_notifications n
            JOIN dbo.verification_cases c ON c.verification_case_id=n.case_id
            LEFT JOIN dbo.workflow_notification_reads r ON r.notification_id=n.public_id AND r.user_id=?
            WHERE n.workspace=? AND (n.workspace='LEGAL' OR (n.recipient_user_id=? AND c.assigned_staff_user_id=?))
            ORDER BY n.occurred_at DESC,n.public_id DESC
            """, (rs, row) -> new Item(UUID.fromString(rs.getString("public_id")),
                UUID.fromString(rs.getString("case_public_id")),
                String.format(Locale.ROOT,"HS-%04d-%06d",rs.getTimestamp("created_at").toLocalDateTime().getYear(),rs.getLong("verification_case_id")),
                rs.getString("action"),rs.getString("reason"),
                rs.getTimestamp("occurred_at").toLocalDateTime().toInstant(java.time.ZoneOffset.UTC),rs.getBoolean("is_read")),
                userId,workspace.name(),userId,userId);
    }

    /**
     * Đánh dấu đã đọc (phục vụ {@code PUT /api/v1/workflow-notifications/{id}/read}).
     * <p>
     * Kiểm tra thông báo nằm trong phạm vi nhìn thấy của người dùng (khóa UPDLOCK/HOLDLOCK), rồi INSERT vào
     * {@code workflow_notification_reads} nếu chưa có dòng (idempotent, tránh trùng khi bấm đồng thời).
     * @param userId    id người dùng hiện tại
     * @param workspace workspace của thông báo
     * @param id        mã công khai của thông báo
     * @return {@link ReadReceipt} với {@code read=true}
     * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND} nếu không thấy thông báo
     */
    @Transactional
    public ReadReceipt markRead(long userId, Workspace workspace, UUID id) {
        var visible = jdbc.queryForList("""
            SELECT n.public_id FROM dbo.workflow_notifications n WITH (UPDLOCK,HOLDLOCK)
            JOIN dbo.verification_cases c ON c.verification_case_id=n.case_id
            WHERE n.public_id=? AND n.workspace=?
              AND (n.workspace='LEGAL' OR (n.recipient_user_id=? AND c.assigned_staff_user_id=?))
            """,String.class,id.toString(),workspace.name(),userId,userId);
        if (visible.isEmpty()) throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        jdbc.update("""
            INSERT INTO dbo.workflow_notification_reads(notification_id,user_id)
            SELECT ?,? WHERE NOT EXISTS (
              SELECT 1 FROM dbo.workflow_notification_reads WHERE notification_id=? AND user_id=?)
            """,id.toString(),userId,id.toString(),userId);
        return new ReadReceipt(id,true);
    }
}
