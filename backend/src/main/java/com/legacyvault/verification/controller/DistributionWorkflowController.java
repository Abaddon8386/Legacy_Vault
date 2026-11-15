package com.legacyvault.verification.controller;

import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.ActionBody;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.Receipt;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.View;
import com.legacyvault.verification.service.DistributionWorkflowService;

import jakarta.validation.Valid;

/**
 * Quy trình phân phối (hợp đồng PR #226). Việc tải lên và chuyển tài liệu vẫn nằm ở các endpoint hồ sơ Staff hiện có;
 * ở đây chỉ có các bước chưa có endpoint. Staff chỉ thấy ca của mình, Legal thao tác trên mọi ca.
 */
// Lớp bao (không khởi tạo) gom hai controller lồng nhau: Staff và Legal. Cả hai dùng chung DistributionWorkflowService,
// phase của quy trình được suy ra phía server từ chuỗi sự kiện, client không gửi phase lên.
// Mọi phản hồi đặt Cache-Control: no-store vì chứa trạng thái quy trình và revision hiện hành.
public final class DistributionWorkflowController {

    private DistributionWorkflowController() { }

    /**
     * Endpoint phía Staff của quy trình phân phối: xem trạng thái ca và nộp phương án phân bổ.
     * Chỉ STAFF_EXECUTOR; việc Staff chỉ thấy ca được giao cho mình do DistributionWorkflowService kiểm tra theo principal.
     */
    @RestController
    @RequestMapping("/api/v1/staff/verification-cases/{caseId}/distribution-workflow")
    @PreAuthorize("hasRole('STAFF_EXECUTOR')")
    public static class Staff {
        private final DistributionWorkflowService workflow;

        public Staff(DistributionWorkflowService workflow) { this.workflow = workflow; }

        /**
         * Xem trạng thái quy trình phân phối hiện tại của ca (phase, hành động được phép, revision).
         * @param caseId public UUID của VerificationCase
         * @param principal Staff đang đăng nhập
         * @return View của quy trình
         */
        @GetMapping
        public ResponseEntity<View> get(@PathVariable UUID caseId, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.view(caseId, DistributionWorkflowService.STAFF, principal));
        }

        /**
         * Staff nộp phương án phân bổ tài sản cho Legal thẩm định (hành động submitAllocations).
         * @param body ActionBody chứa revision và snapshot mà Staff đã xem để chống ghi đè lỗi thời
         * @return Receipt với revision mới
         */
        @PostMapping("/submit-allocations")
        public ResponseEntity<Receipt> submitAllocations(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.perform(caseId, DistributionWorkflowService.STAFF, "submitAllocations", body, principal));
        }
    }

    /**
     * Endpoint phía Legal của quy trình phân phối: xem trạng thái và thực hiện các bước thẩm định tài liệu/phân bổ.
     * Chỉ LEGAL_VERIFIER; Legal được thao tác trên mọi ca (khác với Staff chỉ thấy ca của mình).
     */
    @RestController
    @RequestMapping("/api/v1/legal-verifications/verification-cases/{caseId}/distribution-workflow")
    @PreAuthorize("hasRole('LEGAL_VERIFIER')")
    public static class Legal {
        private final DistributionWorkflowService workflow;

        public Legal(DistributionWorkflowService workflow) { this.workflow = workflow; }

        /**
         * Xem trạng thái quy trình phân phối của ca dưới góc nhìn Legal.
         * @param caseId public UUID của VerificationCase
         * @return View của quy trình
         */
        @GetMapping
        public ResponseEntity<View> get(@PathVariable UUID caseId, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.view(caseId, DistributionWorkflowService.LEGAL, principal));
        }

        /**
         * Legal yêu cầu Staff cung cấp tài liệu căn cứ (requestDocuments).
         */
        @PostMapping("/request-documents")
        public ResponseEntity<Receipt> requestDocuments(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "requestDocuments", body, principal);
        }

        /**
         * Legal chấp nhận tài liệu đã được Staff chuyển (approveDocuments); sau bước này Staff mới nộp phân bổ.
         */
        @PostMapping("/approve-documents")
        public ResponseEntity<Receipt> approveDocuments(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "approveDocuments", body, principal);
        }

        /**
         * Legal yêu cầu Staff bổ sung/chỉnh sửa tài liệu (requestDocumentSupplementation).
         */
        @PostMapping("/request-document-supplementation")
        public ResponseEntity<Receipt> requestDocumentSupplementation(@PathVariable UUID caseId,
                @Valid @RequestBody ActionBody body, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "requestDocumentSupplementation", body, principal);
        }

        /**
         * Legal chấp nhận phương án phân bổ (approveAllocations), mở bước phê duyệt cuối.
         */
        @PostMapping("/approve-allocations")
        public ResponseEntity<Receipt> approveAllocations(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "approveAllocations", body, principal);
        }

        /**
         * Legal yêu cầu Staff điều chỉnh phương án phân bổ (requestAllocationChanges).
         */
        @PostMapping("/request-allocation-changes")
        public ResponseEntity<Receipt> requestAllocationChanges(@PathVariable UUID caseId,
                @Valid @RequestBody ActionBody body, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "requestAllocationChanges", body, principal);
        }

        /**
         * Hàm dùng chung: chuyển tên hành động sang DistributionWorkflowService.perform với workspace LEGAL.
         */
        private ResponseEntity<Receipt> perform(UUID caseId, String action, ActionBody body, CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.perform(caseId, DistributionWorkflowService.LEGAL, action, body, principal));
        }
    }
}
