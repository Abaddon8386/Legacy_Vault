package com.legacyvault.admin;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * Controller cho trang tổng quan (dashboard) của Admin. Base path {@code /api/v1/admin/overview}, yêu cầu {@code ROLE_ADMIN}.
 * Ủy quyền hoàn toàn cho {@link AdminOverviewService}.
 */
@RestController
@RequestMapping("/api/v1/admin/overview")
@PreAuthorize("hasRole('ADMIN')")
public class AdminOverviewController {
    private final AdminOverviewService service;
    /** @param service service thống kê (được Spring inject). */
    public AdminOverviewController(AdminOverviewService service) {this.service=service;}
    /**
     * {@code GET /api/v1/admin/overview} - lấy các con số tổng quan hệ thống.
     *
     * @return 200 kèm {@link AdminOverview} (tổng tài khoản, vault đang hoạt động, hồ sơ đang xử lý, số người theo vai trò);
     *         gắn {@code Cache-Control: no-store} để luôn lấy số mới
     */
    @GetMapping public ResponseEntity<AdminOverview> overview() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.overview());
    }
}
