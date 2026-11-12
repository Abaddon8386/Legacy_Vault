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
 * Quy trình phân chia (distribution workflow, theo contract PR #226). Việc upload giấy tờ và forward vẫn dùng các endpoint
 * dossier hiện có của Staff; ở đây chỉ có các bước chưa có endpoint. Staff chỉ thấy ca của mình, Legal thao tác trên mọi ca.
 *
 * Nhóm controller của quy trình phân chia (distribution workflow) cho hồ sơ căn cứ pháp lý.
 * Gồm hai lớp lồng nhau: {@link Staff} (đường dẫn {@code /api/v1/staff/...}) và {@link Legal}
 * (đường dẫn {@code /api/v1/legal-verifications/...}); cả hai ủy quyền cho {@link DistributionWorkflowService}
 * với tham số vai trò khác nhau. Mọi response gắn {@code Cache-Control: no-store}.
 * Lớp ngoài chỉ là vỏ chứa (constructor private), không tạo instance.
 */
public final class DistributionWorkflowController {

    private DistributionWorkflowController() { }

    /**
     * Phía Staff: {@code /api/v1/staff/verification-cases/{caseId}/distribution-workflow}.
     * Quyền: {@code ROLE_STAFF_EXECUTOR}; Staff chỉ thấy ca của mình.
     */
    @RestController
    @RequestMapping("/api/v1/staff/verification-cases/{caseId}/distribution-workflow")
    @PreAuthorize("hasRole('STAFF_EXECUTOR')")
    public static class Staff {
        private final DistributionWorkflowService workflow;

        public Staff(DistributionWorkflowService workflow) { this.workflow = workflow; }

        @GetMapping
        public ResponseEntity<View> get(@PathVariable UUID caseId, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.view(caseId, DistributionWorkflowService.STAFF, principal));
        }

        /**
         * {@code POST .../distribution-workflow/submit-allocations}: Staff nộp phương án phân chia. Body
         * {@code ActionBody}; gọi {@code workflow.perform(..., "submitAllocations")}; trả {@code Receipt}.
         */
        @PostMapping("/submit-allocations")
        public ResponseEntity<Receipt> submitAllocations(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.perform(caseId, DistributionWorkflowService.STAFF, "submitAllocations", body, principal));
        }
    }

    /**
     * Phía Legal: {@code /api/v1/legal-verifications/verification-cases/{caseId}/distribution-workflow}.
     * Quyền: {@code ROLE_LEGAL_VERIFIER}; Legal thao tác được trên mọi ca. Mỗi POST gọi chung
     * phương thức private {@code perform} với tên hành động tương ứng.
     */
    @RestController
    @RequestMapping("/api/v1/legal-verifications/verification-cases/{caseId}/distribution-workflow")
    @PreAuthorize("hasRole('LEGAL_VERIFIER')")
    public static class Legal {
        private final DistributionWorkflowService workflow;

        public Legal(DistributionWorkflowService workflow) { this.workflow = workflow; }

        @GetMapping
        public ResponseEntity<View> get(@PathVariable UUID caseId, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.view(caseId, DistributionWorkflowService.LEGAL, principal));
        }

        /**
         * {@code POST .../distribution-workflow/request-documents}: Legal yêu cầu Staff nộp giấy tờ.
         */
        @PostMapping("/request-documents")
        public ResponseEntity<Receipt> requestDocuments(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "requestDocuments", body, principal);
        }

        /**
         * {@code POST .../distribution-workflow/approve-documents}: Legal duyệt bộ giấy tờ.
         */
        @PostMapping("/approve-documents")
        public ResponseEntity<Receipt> approveDocuments(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "approveDocuments", body, principal);
        }

        /**
         * {@code POST .../distribution-workflow/request-document-supplementation}: Legal yêu cầu bổ sung giấy tờ.
         */
        @PostMapping("/request-document-supplementation")
        public ResponseEntity<Receipt> requestDocumentSupplementation(@PathVariable UUID caseId,
                @Valid @RequestBody ActionBody body, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "requestDocumentSupplementation", body, principal);
        }

        /**
         * {@code POST .../distribution-workflow/approve-allocations}: Legal duyệt phương án phân chia.
         */
        @PostMapping("/approve-allocations")
        public ResponseEntity<Receipt> approveAllocations(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "approveAllocations", body, principal);
        }

        /**
         * {@code POST .../distribution-workflow/request-allocation-changes}: Legal yêu cầu chỉnh phương án phân chia.
         */
        @PostMapping("/request-allocation-changes")
        public ResponseEntity<Receipt> requestAllocationChanges(@PathVariable UUID caseId,
                @Valid @RequestBody ActionBody body, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "requestAllocationChanges", body, principal);
        }

        /**
         * Gọi chung {@code workflow.perform} với vai trò LEGAL, tên hành động {@code action}, và bọc kết quả
         * vào response 200 {@code no-store}.
         */
        private ResponseEntity<Receipt> perform(UUID caseId, String action, ActionBody body, CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.perform(caseId, DistributionWorkflowService.LEGAL, action, body, principal));
        }
    }
}
