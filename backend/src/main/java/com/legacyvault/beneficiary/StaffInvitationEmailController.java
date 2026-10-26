package com.legacyvault.beneficiary;

import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/invitation-email")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class StaffInvitationEmailController {
    private final StaffInvitationEmailService service;

    public StaffInvitationEmailController(StaffInvitationEmailService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<InvitationEmailDtos.Queued> request(@PathVariable UUID caseId,
            @PathVariable UUID beneficiaryId, @Valid @RequestBody InvitationEmailDtos.Request request) {
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore())
                .body(service.request(caseId, beneficiaryId, request.expectedGeneration()));
    }
}
