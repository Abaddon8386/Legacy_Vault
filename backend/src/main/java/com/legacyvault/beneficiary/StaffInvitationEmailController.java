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

/**
 * Controller xếp hàng email mời cho người thụ hưởng (PS-106). Đường dẫn gốc
 * {@code /api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/invitation-email}; yêu cầu {@code ROLE_STAFF_EXECUTOR}.
 * Frontend dùng qua {@code pages/staff/liveHandoverService.js}.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/invitation-email")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class StaffInvitationEmailController {
    private final StaffInvitationEmailService service;

    /**
     * Hàm khởi tạo, nhận {@code StaffInvitationEmailService}.
     */
    public StaffInvitationEmailController(StaffInvitationEmailService service) {
        this.service = service;
    }

    /**
     * {@code POST .../invitation-email}: cấp (hoặc cấp lại) mã mời gắn với email đã xác nhận tại quầy và xếp email vào outbox.
     * @param request {@code InvitationEmailDtos.Request} chứa {@code expectedGeneration}
     * @return HTTP 202, {@code no-store}, body {@code InvitationEmailDtos.Queued}
     */
    @PostMapping
    public ResponseEntity<InvitationEmailDtos.Queued> request(@PathVariable UUID caseId,
            @PathVariable UUID beneficiaryId, @Valid @RequestBody InvitationEmailDtos.Request request) {
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore())
                .body(service.request(caseId, beneficiaryId, request.expectedGeneration()));
    }
}
