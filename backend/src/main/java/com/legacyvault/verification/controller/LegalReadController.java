package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.verification.dto.LegalReadDtos.*;
import com.legacyvault.verification.service.DistributionWorkflowService;
import com.legacyvault.verification.service.LegalReadService;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

/**
 * API đọc dành cho Legal: hàng đợi ca xác minh và ngữ cảnh chi tiết của một ca. Chỉ LEGAL_VERIFIER; phản hồi no-store.
 */
@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalReadController {
    private final LegalReadService reads;
    private final DistributionWorkflowService distribution;
    public LegalReadController(LegalReadService reads, DistributionWorkflowService distribution) { this.reads=reads; this.distribution=distribution; }
    /**
     * Hàng đợi ca cho Legal.
     * @param status lọc theo trạng thái (tùy chọn)
     * @param route lọc theo route hồ sơ căn cứ (tùy chọn)
     * @param page trang (từ 0)
     * @param size kích thước trang (mặc định 20)
     */
    @GetMapping
    public ResponseEntity<PageResponse<QueueItem>> queue(@AuthenticationPrincipal CustomUserPrincipal principal,
        @RequestParam(required=false) String status,@RequestParam(required=false) String route,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reads.queue(principal,status,route,page,size));
    }
    /**
     * Ngữ cảnh của ca cho Legal; khả năng phê duyệt/mở khóa còn phụ thuộc phase của quy trình phân phối.
     */
    @GetMapping("/{caseId}/context")
    public ResponseEntity<Context> context(@AuthenticationPrincipal CustomUserPrincipal principal,@PathVariable UUID caseId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(distribution.legalContext(principal,caseId));
    }
}
