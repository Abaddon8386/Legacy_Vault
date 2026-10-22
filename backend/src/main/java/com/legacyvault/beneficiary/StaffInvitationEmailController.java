package com.legacyvault.beneficiary;

import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/invitation-email")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class StaffInvitationEmailController {
    private final StaffInvitationEmailService service;
    private final InvitationMailStatusService statuses;

    public StaffInvitationEmailController(StaffInvitationEmailService service, InvitationMailStatusService statuses) {
        this.service = service;
        this.statuses = statuses;
    }

    @PostMapping
    public ResponseEntity<InvitationEmailDtos.Queued> request(@PathVariable UUID caseId,
            @PathVariable UUID beneficiaryId, @Valid @RequestBody InvitationEmailDtos.Request request) {
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore())
                .body(service.request(caseId, beneficiaryId, request.expectedGeneration()));
    }
    @GetMapping("/{outboxId}")
    public ResponseEntity<InvitationEmailDtos.Queued> status(@PathVariable UUID caseId,@PathVariable UUID beneficiaryId,@PathVariable UUID outboxId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(statuses.get(caseId,beneficiaryId,outboxId));
    }
    @GetMapping
    public ResponseEntity<InvitationEmailDtos.Queued> latestStatus(@PathVariable UUID caseId,@PathVariable UUID beneficiaryId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(statuses.get(caseId,beneficiaryId,null));
    }
}
