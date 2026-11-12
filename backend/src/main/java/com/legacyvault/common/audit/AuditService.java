package com.legacyvault.common.audit;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;

/**
 * Lớp tương thích (bean tên {@code workflowAuditService}) cho các service quy trình (xác minh, bàn giao, pháp lý)
 * muốn ghi audit bằng chuỗi thay vì {@link AuditEvent}. Chỉ chuyển đổi tham số rồi ủy quyền cho
 * {@link com.legacyvault.audit.AuditService#record(AuditEvent)}, vốn lưu vào bảng {@code audit_logs}.
 *
 * <p>Compatibility entry point; persistence stays in the PS-13 audit service.
 */
@Service("workflowAuditService")
public class AuditService {
    private final com.legacyvault.audit.AuditService delegate;
    private final ObjectMapper objectMapper;

    /** Nhận service audit thật (để ủy quyền) và {@link ObjectMapper} dùng tạo JSON trạng thái. */
    public AuditService(com.legacyvault.audit.AuditService delegate, ObjectMapper objectMapper) {
        this.delegate = delegate;
        this.objectMapper = objectMapper;
    }

    /**
     * Ghi một audit event dạng chuỗi. Các khóa đặc biệt {@code stateBefore}, {@code stateAfter}, {@code stepId},
     * {@code ruleId} được tách khỏi {@code details} để đưa vào đúng trường của {@link AuditEvent}; phần còn lại là
     * {@code context}.
     *
     * @param actorUserId id người thực hiện
     * @param vaultId     két liên quan, có thể null
     * @param action      tên của {@link AuditAction}
     * @param entityType  loại đối tượng bị tác động
     * @param entityId    id đối tượng
     * @param actorType   tên của {@link AuditActorType} ({@code USER} hoặc {@code SYSTEM})
     * @param details     ngữ cảnh bổ sung, có thể null
     * @throws IllegalArgumentException nếu {@code action} hoặc {@code actorType} không phải tên enum hợp lệ
     */
    public void record(Long actorUserId, Long vaultId, String action, String entityType, Long entityId,
            String actorType, Map<String, ?> details) {
        Map<String, Object> context = new LinkedHashMap<>();
        if (details != null) context.putAll(details);
        String before = stateJson(removeString(context, "stateBefore"));
        String after = stateJson(removeString(context, "stateAfter"));
        String stepId = removeString(context, "stepId");
        String ruleId = removeString(context, "ruleId");
        delegate.record(new AuditEvent(AuditAction.valueOf(action), AuditActorType.valueOf(actorType),
                actorUserId, vaultId, entityType, entityId, before, after, null, context, stepId, ruleId));
    }

    /** Lấy và xóa khóa khỏi map, trả về dạng chuỗi (null nếu không có). */
    private String removeString(Map<String, Object> context, String key) {
        Object value = context.remove(key);
        return value == null ? null : value.toString();
    }

    /** Bọc trạng thái thành JSON {@code {"status": ...}}; trả null nếu đầu vào null. */
    private String stateJson(String status) {
        if (status == null) return null;
        try {
            return objectMapper.writeValueAsString(Map.of("status", status));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialize audit state", ex);
        }
    }
}
