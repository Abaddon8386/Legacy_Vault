package com.legacyvault.admin;
import com.legacyvault.admin.AdminAuditDtos.*;
import com.legacyvault.common.web.PageResponse;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
/**
 * Controller chỉ-đọc cho màn "Nhật ký kiểm toán" của Admin.
 * <p>Base path: {@code /api/v1/admin/audit-logs}. Toàn bộ class yêu cầu {@code ROLE_ADMIN}.
 * Mọi response đều gắn {@code Cache-Control: no-store} để trình duyệt/proxy không lưu lại dữ liệu nhạy cảm.
 * <p>Logic truy vấn nằm hết ở {@link AdminAuditService}; controller chỉ nhận tham số và trả {@code ResponseEntity}.
 */
@RestController
@RequestMapping("/api/v1/admin/audit-logs")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAuditController {
    private final AdminAuditService service;
    /** @param service service truy vấn bảng {@code audit_logs} (được Spring inject). */
    public AdminAuditController(AdminAuditService service) {this.service=service;}
    /**
     * {@code GET /api/v1/admin/audit-logs} - liệt kê nhật ký kiểm toán có phân trang và bộ lọc.
     * <p>Frontend gọi qua {@code adminService.js} (màn Audit của Admin). Các tham số đều tùy chọn, kết hợp bằng AND.
     *
     * @param from       mốc bắt đầu (ISO-8601 UTC, bao gồm); sai định dạng -> {@code VALIDATION_FAILED}
     * @param to         mốc kết thúc (ISO-8601 UTC, không bao gồm); phải sau {@code from}
     * @param action     tên {@code AuditAction}, hoặc {@code LEGACY_EVENT} cho các sự kiện cũ không còn trong enum
     * @param actorId    publicId của người thực hiện
     * @param actorKind  một trong SYSTEM, USER, DELETED_USER, UNKNOWN
     * @param actorRole  vai trò chính của người thực hiện (VAULT_OWNER, STAFF_EXECUTOR, LEGAL_VERIFIER, BENEFICIARY, ADMIN)
     * @param vaultId    publicId của vault liên quan
     * @param caseNumber mã hồ sơ dạng {@code HS-YYYY-NNNNNN}
     * @param page       trang (bắt đầu từ 0, mặc định 0)
     * @param size       kích thước trang (1-100, mặc định 20)
     * @return 200 kèm {@code PageResponse<Event>}, sắp xếp mới nhất trước
     */
    @GetMapping public ResponseEntity<PageResponse<Event>> list(@RequestParam(required=false) String from,@RequestParam(required=false) String to,
        @RequestParam(required=false) String action,@RequestParam(required=false) UUID actorId,@RequestParam(required=false) String actorKind,
        @RequestParam(required=false) String actorRole,@RequestParam(required=false) UUID vaultId,@RequestParam(required=false) String caseNumber,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(from,to,action,actorId,actorKind,actorRole,vaultId,caseNumber,page,size));
    }
    /**
     * {@code GET /api/v1/admin/audit-logs/{id}} - xem chi tiết một dòng nhật ký.
     *
     * @param id publicId của dòng audit
     * @return 200 kèm {@code Detail} (sự kiện + traceId để lần theo log hệ thống); 404 {@code RESOURCE_NOT_FOUND} nếu không có
     */
    @GetMapping("/{id}") public ResponseEntity<Detail> detail(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.detail(id));
    }
}
