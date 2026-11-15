package com.legacyvault.audit;

import java.util.Map;

/**
 * Dữ liệu đầu vào của một sự kiện audit; {@link AuditService#record(AuditEvent)} sẽ lưu thành {@link AuditLog}.
 *
 * @param action      hành động nghiệp vụ
 * @param actorType   USER hoặc SYSTEM
 * @param actorUserId id người thực hiện; bắt buộc với USER (trừ AUTH_LOGIN_FAILED vì khi đó có thể chưa xác định được người dùng)
 * @param vaultId     Vault liên quan (có thể null)
 * @param entityType loại đối tượng bị tác động (tối đa 50 ký tự)
 * @param entityId    id đối tượng bị tác động
 * @param stateBefore trạng thái trước (JSON object hoặc chuỗi trạng thái đơn giản)
 * @param stateAfter  trạng thái sau
 * @param ipAddress   IP nguồn (tối đa 45 ký tự, có thể null)
 * @param context     thông tin bổ sung; khóa nhạy cảm bị loại khi ghi
 * @param stepId      mã bước quy trình (tối đa 50 ký tự)
 * @param ruleId      mã quy tắc nghiệp vụ (tối đa 100 ký tự)
 */
public record AuditEvent(
        AuditAction action,
        AuditActorType actorType,
        Long actorUserId,
        Long vaultId,
        String entityType,
        Long entityId,
        String stateBefore,
        String stateAfter,
        String ipAddress,
        Map<String, Object> context,
        String stepId,
        String ruleId
) {
    // Kiểm tra bất biến ngay khi tạo event để không bao giờ lưu bản ghi thiếu thông tin định danh; context được sao chép thành Map bất biến.
    public AuditEvent {
        if (action == null) {
            throw new IllegalArgumentException("Audit action is required");
        }
        if (actorType == null) {
            throw new IllegalArgumentException("Audit actor type is required");
        }
        if (actorType == AuditActorType.USER
                && actorUserId == null
                && action != AuditAction.AUTH_LOGIN_FAILED) {
            throw new IllegalArgumentException(
                    "USER audit events require actorUserId except AUTH_LOGIN_FAILED"
            );
        }
        if (entityType == null || entityType.isBlank()) {
            throw new IllegalArgumentException("Entity type is required");
        }
        if (entityType.length() > 50) {
            throw new IllegalArgumentException("Entity type must not exceed 50 characters");
        }
        if (stepId != null && stepId.length() > 50) {
            throw new IllegalArgumentException("Step ID must not exceed 50 characters");
        }
        if (ruleId != null && ruleId.length() > 100) {
            throw new IllegalArgumentException("Rule ID must not exceed 100 characters");
        }
        context = context == null ? Map.of() : Map.copyOf(context);
    }
}