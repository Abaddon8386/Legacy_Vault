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

@Service
public class WorkflowNotificationService {
    public enum Workspace { STAFF, LEGAL }
    public record Item(UUID id, UUID caseId, String caseNumber, String action, String reason,
                       Instant occurredAt, boolean read) {}
    public record ReadReceipt(UUID id, boolean read) {}
    public record Receipt(UUID id, Workspace recipientWorkspace, String status) {}
    private final JdbcTemplate jdbc;
    private final VerificationCaseRepository cases;
    public WorkflowNotificationService(JdbcTemplate jdbc, VerificationCaseRepository cases) {
        this.jdbc = jdbc;
        this.cases = cases;
    }

    // The case lock serializes retries; notification persistence participates in the business transaction.
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
