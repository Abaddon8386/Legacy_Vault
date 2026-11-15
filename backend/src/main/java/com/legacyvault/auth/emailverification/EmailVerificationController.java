package com.legacyvault.auth.emailverification;

import java.time.LocalDateTime;
import com.legacyvault.auth.recovery.RecoveryRateLimiter;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * API xác minh quyền sở hữu email dưới {@code /api/v1/auth/email-verification}: xem trạng thái, yêu cầu gửi (hoặc gửi lại) và xác nhận bằng credential.
 * Tài khoản luôn được xác định từ principal đã đăng nhập (request) hoặc từ chính credential (confirm), client không bao giờ chỉ định tài khoản.
 */
@RestController
@RequestMapping("/api/v1/auth/email-verification")
public class EmailVerificationController {
    private final EmailVerificationConfiguration config;
    private final RecoveryRateLimiter limits;
    private final EmailVerificationService service;
    public EmailVerificationController(EmailVerificationConfiguration config,RecoveryRateLimiter limits,EmailVerificationService service) {
        this.config=config; this.limits=limits; this.service=service;
    }

    /** Trạng thái xác minh email của người dùng hiện tại và lần yêu cầu gần nhất. */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<StatusResponse> status(@AuthenticationPrincipal CustomUserPrincipal principal) {
        var status=operational(()->service.status(CustomUserPrincipal.requireUserId(principal)));
        return ResponseEntity.ok().header("Cache-Control","no-store").body(new StatusResponse(status.verified(),status.verifiedAt(),
                status.requestAvailable(),status.lastRequestState(),status.lastRequestedAt()));
    }

    /** Yêu cầu gửi và gửi lại là cùng một lời gọi; server quyết định việc tạo credential mới và xử lý các credential cũ. */
    @PostMapping("/requests")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<RequestResponse> request(@Valid @RequestBody(required=false) Request body,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        Long userId=CustomUserPrincipal.requireUserId(principal);
        if(!config.ready()) throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_UNAVAILABLE);
        var outcome=operational(()->{
            // Mọi cửa sổ giới hạn đều phải cho phép request: cooldown 60 giây, rồi đến giới hạn ngắn hạn và giới hạn theo ngày.
            int index=0;
            for(var limit:config.sendLimits())
                if(!limits.allow("verify-email-send-"+(index++),String.valueOf(userId),limit.max(),limit.seconds()))
                    throw new BusinessException(ErrorCode.RATE_LIMITED);
            return service.enqueue(userId,body==null?null:body.locale());
        });
        return switch(outcome) {
            case QUEUED -> ResponseEntity.accepted().header("Cache-Control","no-store").body(new RequestResponse("QUEUED"));
            case ALREADY_VERIFIED -> throw new BusinessException(ErrorCode.EMAIL_ALREADY_VERIFIED);
            case NOT_APPLICABLE -> throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_NOT_APPLICABLE);
        };
    }

    /** Công khai: credential (không phải client) xác định tài khoản. */
    // Giới hạn theo IP vì endpoint công khai: tránh dò đoán credential.
    @PostMapping("/confirm")
    public ResponseEntity<Void> confirm(@Valid @RequestBody Confirm body,HttpServletRequest request) {
        operational(()->{
            var limit=config.confirmLimit();
            if(!limits.allow("verify-email-confirm-ip",request.getRemoteAddr(),limit.max(),limit.seconds()))
                throw new BusinessException(ErrorCode.RATE_LIMITED);
            service.verify(body.credential()); return null;
        });
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }

    // Lỗi hạ tầng bất ngờ (RuntimeException) được che thành EMAIL_VERIFICATION_UNAVAILABLE để không lộ chi tiết nội bộ; lỗi nghiệp vụ được giữ nguyên.
    private <T> T operational(java.util.function.Supplier<T> work) {
        try { return work.get(); }
        catch(BusinessException e) { throw e; }
        catch(RuntimeException e) { throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_UNAVAILABLE); }
    }

    public record Request(@Pattern(regexp="vi|en") String locale) { }
    public record Confirm(@NotBlank @Size(max=128) String credential) {
        @Override public String toString() { return "EmailVerificationConfirm[redacted]"; }
    }
    public record RequestResponse(String status) { }
    public record StatusResponse(boolean verified,LocalDateTime verifiedAt,boolean requestAvailable,
            String lastRequestState,LocalDateTime lastRequestedAt) { }
}
