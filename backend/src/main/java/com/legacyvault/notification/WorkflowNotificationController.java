package com.legacyvault.notification;

import com.legacyvault.common.security.CustomUserPrincipal;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;

/**
 * Controller thông báo luồng nghiệp vụ (workflow notification) cho hai không gian làm việc: Staff và Legal.
 * <p>
 * Base path {@code /api/v1/workflow-notifications}. Cả hai endpoint đều dùng {@code @PreAuthorize} theo tham số
 * {@code workspace}: {@code STAFF} cần {@code ROLE_STAFF_EXECUTOR}, {@code LEGAL} cần {@code ROLE_LEGAL_VERIFIER}.
 * Phản hồi gắn {@code Cache-Control: no-store}. Logic nằm ở {@link WorkflowNotificationService}.
 */
@RestController
@RequestMapping("/api/v1/workflow-notifications")
public class WorkflowNotificationController {
    /**
     * Service xử lý đọc danh sách và đánh dấu đã đọc thông báo.
     */
    private final WorkflowNotificationService service;
    /**
     * Khởi tạo controller với {@link WorkflowNotificationService}.
     * @param service service thông báo luồng nghiệp vụ
     */
    public WorkflowNotificationController(WorkflowNotificationService service) { this.service=service; }

    /**
     * {@code GET /api/v1/workflow-notifications?workspace=STAFF|LEGAL}: liệt kê tối đa 50 thông báo mới nhất của người dùng hiện tại.
     * <p>
     * Quyền: STAFF_EXECUTOR (workspace STAFF) hoặc LEGAL_VERIFIER (workspace LEGAL). Gọi {@link WorkflowNotificationService#list}.
     * @param workspace không gian làm việc cần xem (query param bắt buộc)
     * @param principal người dùng đang đăng nhập; id lấy bằng {@code CustomUserPrincipal.requireUserId}
     * @return 200 với danh sách {@link WorkflowNotificationService.Item}, không cache
     */
    @GetMapping
    @PreAuthorize("(#workspace.name() == 'STAFF' && hasRole('STAFF_EXECUTOR')) || (#workspace.name() == 'LEGAL' && hasRole('LEGAL_VERIFIER'))")
    public ResponseEntity<List<WorkflowNotificationService.Item>> list(
            @RequestParam WorkflowNotificationService.Workspace workspace,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.list(CustomUserPrincipal.requireUserId(principal),workspace));
    }
    /**
     * {@code PUT /api/v1/workflow-notifications/{id}/read?workspace=STAFF|LEGAL}: đánh dấu một thông báo là đã đọc cho người dùng hiện tại.
     * <p>
     * Quyền như {@link #list}. Gọi {@link WorkflowNotificationService#markRead}; thao tác idempotent. Ném
     * {@code BusinessException(RESOURCE_NOT_FOUND)} nếu thông báo không thuộc phạm vi người dùng nhìn thấy.
     * @param id        mã công khai (UUID) của thông báo
     * @param workspace không gian làm việc của thông báo
     * @param principal người dùng đang đăng nhập
     * @return 200 với {@link WorkflowNotificationService.ReadReceipt}, không cache
     */
    @PutMapping("/{id}/read")
    @PreAuthorize("(#workspace.name() == 'STAFF' && hasRole('STAFF_EXECUTOR')) || (#workspace.name() == 'LEGAL' && hasRole('LEGAL_VERIFIER'))")
    public ResponseEntity<WorkflowNotificationService.ReadReceipt> read(
            @PathVariable UUID id, @RequestParam WorkflowNotificationService.Workspace workspace,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.markRead(CustomUserPrincipal.requireUserId(principal),workspace,id));
    }
}
