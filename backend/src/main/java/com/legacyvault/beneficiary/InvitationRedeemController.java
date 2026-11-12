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

/**
 * Controller đổi mã mời. Đường dẫn gốc {@code /api/v1/auth/invitations}; yêu cầu đã đăng nhập. Frontend dùng ở trang
 * {@code pages/beneficiary/InvitationPage.jsx}.
 */
@RestController
@RequestMapping("/api/v1/auth/invitations")
@PreAuthorize("isAuthenticated()")
public class InvitationRedeemController {
    private final InvitationRedeemService service;

    /**
     * Hàm khởi tạo, nhận {@code InvitationRedeemService}.
     */
    public InvitationRedeemController(InvitationRedeemService service) {
        this.service = service;
    }

    /**
     * {@code POST /api/v1/auth/invitations/redeem}: tài khoản đang đăng nhập dùng mã mời để liên kết với hồ sơ người thụ hưởng.
     * @param request {@code InvitationDtos.RedeemRequest}
     * @param principal tài khoản đang đăng nhập (id lấy từ principal, không từ body)
     * @return HTTP 200, {@code no-store}, body {@code InvitationDtos.Linked}
     */
    @PostMapping("/redeem")
    public ResponseEntity<InvitationDtos.Linked> redeem(@Valid @RequestBody InvitationDtos.RedeemRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.redeem(CustomUserPrincipal.requireUserId(principal), request.code()));
    }
}
