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
 * Distribution workflow (PR #226 contract). The document upload and forward stay on the existing Staff dossier endpoints;
 * only the steps that have no endpoint yet are here. Staff see their own cases, Legal act on any case.
 */
public final class DistributionWorkflowController {

    private DistributionWorkflowController() { }

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

        @PostMapping("/submit-allocations")
        public ResponseEntity<Receipt> submitAllocations(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.perform(caseId, DistributionWorkflowService.STAFF, "submitAllocations", body, principal));
        }
    }

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

        @PostMapping("/request-documents")
        public ResponseEntity<Receipt> requestDocuments(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "requestDocuments", body, principal);
        }

        @PostMapping("/approve-documents")
        public ResponseEntity<Receipt> approveDocuments(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "approveDocuments", body, principal);
        }

        @PostMapping("/request-document-supplementation")
        public ResponseEntity<Receipt> requestDocumentSupplementation(@PathVariable UUID caseId,
                @Valid @RequestBody ActionBody body, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "requestDocumentSupplementation", body, principal);
        }

        @PostMapping("/approve-allocations")
        public ResponseEntity<Receipt> approveAllocations(@PathVariable UUID caseId, @Valid @RequestBody ActionBody body,
                @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "approveAllocations", body, principal);
        }

        @PostMapping("/request-allocation-changes")
        public ResponseEntity<Receipt> requestAllocationChanges(@PathVariable UUID caseId,
                @Valid @RequestBody ActionBody body, @AuthenticationPrincipal CustomUserPrincipal principal) {
            return perform(caseId, "requestAllocationChanges", body, principal);
        }

        private ResponseEntity<Receipt> perform(UUID caseId, String action, ActionBody body, CustomUserPrincipal principal) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(workflow.perform(caseId, DistributionWorkflowService.LEGAL, action, body, principal));
        }
    }
}
