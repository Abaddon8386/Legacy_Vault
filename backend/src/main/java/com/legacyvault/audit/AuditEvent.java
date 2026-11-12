package com.legacyvault.audit;

import java.util.Map;

/**
 * Mô tả một sự kiện cần ghi audit; được truyền vào {@code AuditService.record(AuditEvent)} để lưu thành một dòng
 * của bảng {@code audit_logs}. Constructor chuẩn (compact) kiểm tra dữ liệu đầu vào và ném
 * {@link IllegalArgumentException} nếu vi phạm.
 *
 * <ul>
 *   <li>{@code action}: hành động ({@link AuditAction}), bắt buộc;</li>
 *   <li>{@code actorType}: {@link AuditActorType}, bắt buộc; nếu là {@code USER} thì phải có {@code actorUserId}
 *       (ngoại lệ duy nhất là {@code AUTH_LOGIN_FAILED});</li>
 *   <li>{@code actorUserId}: id người thực hiện (null với SYSTEM hoặc đăng nhập sai không xác định được user);</li>
 *   <li>{@code vaultId}: két liên quan, có thể null;</li>
 *   <li>{@code entityType}: tên loại đối tượng bị tác động (bắt buộc, tối đa 50 ký tự);</li>
 *   <li>{@code entityId}: id đối tượng bị tác động, có thể null;</li>
 *   <li>{@code stateBefore}, {@code stateAfter}: trạng thái trước/sau (JSON object, hoặc chuỗi thường sẽ được bọc
 *       thành {@code {"status": ...}});</li>
 *   <li>{@code ipAddress}: IP máy khách (tối đa 45 ký tự), có thể null;</li>
 *   <li>{@code context}: thông tin bổ sung, được sao chép bất biến (null thành map rỗng); khóa nhạy cảm bị lọc bởi
 *       {@code AuditService};</li>
 *   <li>{@code stepId}: mã bước nghiệp vụ (tối đa 50 ký tự), tùy chọn;</li>
 *   <li>{@code ruleId}: mã quy tắc nghiệp vụ (tối đa 100 ký tự), tùy chọn.</li>
 * </ul>
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
    /** Kiểm tra các ràng buộc của sự kiện audit và chuẩn hóa {@code context} thành map bất biến. */
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