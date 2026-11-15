package com.legacyvault.beneficiary;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.common.security.CustomUserPrincipal;

import jakarta.validation.Valid;

/** API đổi mã mời để liên kết tài khoản đang đăng nhập với người thụ hưởng (PS-87). */
@RestController
@RequestMapping("/api/v1/auth/invitations")
@PreAuthorize("isAuthenticated()")
public class InvitationRedeemController {
    private final InvitationRedeemService service;

    public InvitationRedeemController(InvitationRedeemService service) {
        this.service = service;
    }

    /** POST /redeem: lấy id tài khoản từ principal (không nhận từ body) và gọi service; no-store vì phản hồi cá nhân. */
    @PostMapping("/redeem")
    public ResponseEntity<InvitationDtos.Linked> redeem(@Valid @RequestBody InvitationDtos.RedeemRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.redeem(CustomUserPrincipal.requireUserId(principal), request.code()));
    }
}
