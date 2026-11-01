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
 * PS-122: read-only endpoints next to the PS-119/120 gate. Every response is {@code no-store}; none of them writes.
 * Mutations stay on {@link GroupHandoverController}.
 */
@RestController
public class GroupHandoverReadController {

    private final GroupHandoverReadService reads;
    private final GroupHandoverService group;

    public GroupHandoverReadController(GroupHandoverReadService reads, GroupHandoverService group) {
        this.reads = reads;
        this.group = group;
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    /** Legal: pending Staff reopen requests that can be decided now (oldest first). */
    @GetMapping("/api/v1/legal-verifications/group-handover/reopen-requests")
    @PreAuthorize("hasRole('LEGAL_VERIFIER')")
    public ResponseEntity<?> pending(@RequestParam(required = false) UUID caseId,
            @RequestParam(required = false) String caseNumber, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @AuthenticationPrincipal CustomUserPrincipal actor) {
        return noStore(reads.pendingForLegal(actor, caseId, caseNumber, page, size));
    }

    /** Staff: event history of the case (newest first). */
    @GetMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/events")
    @PreAuthorize("hasRole('STAFF_EXECUTOR')")
    public ResponseEntity<?> staffHistory(@PathVariable UUID caseId, @PathVariable UUID sessionId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal CustomUserPrincipal actor) {
        return noStore(group.history(caseId, sessionId, actor, false, page, size));
    }

    /** Legal: event history of the case (newest first). */
    @GetMapping("/api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover/events")
    @PreAuthorize("hasRole('LEGAL_VERIFIER')")
    public ResponseEntity<?> legalHistory(@PathVariable UUID caseId, @PathVariable UUID sessionId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal CustomUserPrincipal actor) {
        return noStore(group.history(caseId, sessionId, actor, true, page, size));
    }

    /**
     * Recipient: own linked cases with the case-wide group status and the account's own approved/delivered counts.
     * The account comes only from the authenticated principal.
     */
    @GetMapping("/api/v1/beneficiary-handover-status")
    @PreAuthorize("hasRole('BENEFICIARY')")
    public ResponseEntity<?> beneficiaryStatus(@AuthenticationPrincipal CustomUserPrincipal actor) {
        return noStore(reads.beneficiaryStatus(actor));
    }
}
