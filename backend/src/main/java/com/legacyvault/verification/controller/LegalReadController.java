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
 * Đọc hàng đợi và ngữ cảnh ca xác minh phía Legal.
 * Phạm vi: {@code /api/v1/legal-verifications/verification-cases}. Quyền: {@code ROLE_LEGAL_VERIFIER}.
 * Dùng {@link LegalReadService} và {@code DistributionWorkflowService}; response {@code no-store}.
 */
@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalReadController {
    private final LegalReadService reads;
    private final DistributionWorkflowService distribution;
    public LegalReadController(LegalReadService reads, DistributionWorkflowService distribution) { this.reads=reads; this.distribution=distribution; }
    /**
     * {@code GET /api/v1/legal-verifications/verification-cases?status=&route=&page=0&size=20}
     * Hàng đợi ca cho Legal, có lọc theo trạng thái và tuyến xử lý, phân trang.
     *
     * @return trang các {@code QueueItem}
     */
    @GetMapping
    public ResponseEntity<PageResponse<QueueItem>> queue(@AuthenticationPrincipal CustomUserPrincipal principal,
        @RequestParam(required=false) String status,@RequestParam(required=false) String route,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reads.queue(principal,status,route,page,size));
    }
    /**
     * {@code GET .../verification-cases/{caseId}/context}: ngữ cảnh đầy đủ của ca cho Legal
     * (qua {@code DistributionWorkflowService.legalContext}).
     */
    @GetMapping("/{caseId}/context")
    public ResponseEntity<Context> context(@AuthenticationPrincipal CustomUserPrincipal principal,@PathVariable UUID caseId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(distribution.legalContext(principal,caseId));
    }
}
