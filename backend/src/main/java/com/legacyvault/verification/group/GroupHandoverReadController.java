package com.legacyvault.verification.group;

import com.legacyvault.common.security.CustomUserPrincipal;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * PS-122: các endpoint chỉ đọc đặt cạnh cổng PS-119/120. Mọi response đều {@code no-store}; không endpoint nào ghi dữ liệu.
 * Các thao tác ghi nằm ở {@link GroupHandoverController}.
 *
 * Endpoint đọc cho bàn giao theo nhóm: yêu cầu mở lại đang chờ (Legal), lịch sử sự kiện (Staff/Legal) và
 * trạng thái của người thụ hưởng. Dùng {@link GroupHandoverReadService} và {@link GroupHandoverService#history}.
 */
@RestController
public class GroupHandoverReadController {

    private final GroupHandoverReadService reads;
    private final GroupHandoverService group;

    public GroupHandoverReadController(GroupHandoverReadService reads, GroupHandoverService group) {
        this.reads = reads;
        this.group = group;
    }

    /**
     * Bọc {@code body} vào response 200 không cache.
     */
    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    /**
     * Legal: các yêu cầu mở lại của Staff đang chờ và có thể quyết định ngay (cũ nhất trước).
     *
     * {@code GET /api/v1/legal-verifications/group-handover/reopen-requests?caseId=&caseNumber=&page=0&size=20}
     * Quyền: {@code ROLE_LEGAL_VERIFIER}. Trả trang {@code PendingRequest}.
     */
    @GetMapping("/api/v1/legal-verifications/group-handover/reopen-requests")
    @PreAuthorize("hasRole('LEGAL_VERIFIER')")
    public ResponseEntity<?> pending(@RequestParam(required = false) UUID caseId,
            @RequestParam(required = false) String caseNumber, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @AuthenticationPrincipal CustomUserPrincipal actor) {
        return noStore(reads.pendingForLegal(actor, caseId, caseNumber, page, size));
    }

    /**
     * Staff: lịch sử sự kiện của ca (mới nhất trước).
     *
     * {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/events}
     * Quyền: {@code ROLE_STAFF_EXECUTOR}. Lịch sử sự kiện phân trang.
     */
    @GetMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/events")
    @PreAuthorize("hasRole('STAFF_EXECUTOR')")
    public ResponseEntity<?> staffHistory(@PathVariable UUID caseId, @PathVariable UUID sessionId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal CustomUserPrincipal actor) {
        return noStore(group.history(caseId, sessionId, actor, false, page, size));
    }

    /**
     * Legal: lịch sử sự kiện của ca (mới nhất trước).
     *
     * {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/events}
     * Quyền: {@code ROLE_LEGAL_VERIFIER}. Lịch sử sự kiện phân trang.
     */
    @GetMapping("/api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/events")
    @PreAuthorize("hasRole('LEGAL_VERIFIER')")
    public ResponseEntity<?> legalHistory(@PathVariable UUID caseId, @PathVariable UUID sessionId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal CustomUserPrincipal actor) {
        return noStore(group.history(caseId, sessionId, actor, true, page, size));
    }

    /**
     * Người nhận: các ca mà tài khoản được liên kết, kèm trạng thái cổng nhóm toàn ca và số lượng đã duyệt/đã giao của riêng tài khoản.
     * Tài khoản chỉ lấy từ principal đã xác thực.
     *
     * {@code GET /api/v1/beneficiary-handover-status}
     * Quyền: {@code ROLE_BENEFICIARY}. Trả {@code BeneficiaryStatus} của tài khoản đang đăng nhập.
     */
    @GetMapping("/api/v1/beneficiary-handover-status")
    @PreAuthorize("hasRole('BENEFICIARY')")
    public ResponseEntity<?> beneficiaryStatus(@AuthenticationPrincipal CustomUserPrincipal actor) {
        return noStore(reads.beneficiaryStatus(actor));
    }
}
