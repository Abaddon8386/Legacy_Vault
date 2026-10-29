package com.legacyvault.notification;

import com.legacyvault.common.security.CustomUserPrincipal;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/workflow-notifications")
public class WorkflowNotificationController {
    private final WorkflowNotificationService service;
    public WorkflowNotificationController(WorkflowNotificationService service) { this.service=service; }

    @GetMapping
    @PreAuthorize("(#workspace.name() == 'STAFF' && hasRole('STAFF_EXECUTOR')) || (#workspace.name() == 'LEGAL' && hasRole('LEGAL_VERIFIER'))")
    public ResponseEntity<List<WorkflowNotificationService.Item>> list(
            @RequestParam WorkflowNotificationService.Workspace workspace,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.list(CustomUserPrincipal.requireUserId(principal),workspace));
    }
    @PutMapping("/{id}/read")
    @PreAuthorize("(#workspace.name() == 'STAFF' && hasRole('STAFF_EXECUTOR')) || (#workspace.name() == 'LEGAL' && hasRole('LEGAL_VERIFIER'))")
    public ResponseEntity<WorkflowNotificationService.ReadReceipt> read(
            @PathVariable UUID id, @RequestParam WorkflowNotificationService.Workspace workspace,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.markRead(CustomUserPrincipal.requireUserId(principal),workspace,id));
    }
}
