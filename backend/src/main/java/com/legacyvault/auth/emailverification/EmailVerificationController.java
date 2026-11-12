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
 * Controller xác minh email (PS-116), gốc {@code /api/v1/auth/email-verification}. Tài khoản luôn lấy từ principal (gửi yêu cầu,
 * xem trạng thái) hoặc từ chính mã (xác nhận); client không bao giờ chỉ định tài khoản hay cờ đã xác minh.
 */
@RestController
@RequestMapping("/api/v1/auth/email-verification")
public class EmailVerificationController {
    /**
     * Cấu hình xác minh email.
     */
    private final EmailVerificationConfiguration config;
    /**
     * Bộ giới hạn tốc độ bền vững dùng chung với khôi phục mật khẩu.
     */
    private final RecoveryRateLimiter limits;
    /**
     * Dịch vụ nghiệp vụ xác minh email.
     */
    private final EmailVerificationService service;
    /**
     * @param config  cấu hình
     * @param limits  bộ giới hạn tốc độ
     * @param service dịch vụ xác minh
     */
    public EmailVerificationController(EmailVerificationConfiguration config,RecoveryRateLimiter limits,EmailVerificationService service) {
        this.config=config; this.limits=limits; this.service=service;
    }

    /**
     * {@code GET /api/v1/auth/email-verification} (cần đăng nhập): trạng thái xác minh email của tài khoản hiện tại.
     *
     * @param principal người dùng từ JWT
     * @return {@code 200} với {@link StatusResponse}, header {@code Cache-Control: no-store}
     * @throws BusinessException {@code UNAUTHENTICATED}, {@code EMAIL_VERIFICATION_UNAVAILABLE}
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<StatusResponse> status(@AuthenticationPrincipal CustomUserPrincipal principal) {
        var status=operational(()->service.status(CustomUserPrincipal.requireUserId(principal)));
        return ResponseEntity.ok().header("Cache-Control","no-store").body(new StatusResponse(status.verified(),status.verifiedAt(),
                status.requestAvailable(),status.lastRequestState(),status.lastRequestedAt()));
    }

    /**
     * {@code POST /api/v1/auth/email-verification/requests} (cần đăng nhập): yêu cầu gửi (hoặc gửi lại) mail xác minh; lần đầu và gửi
     * lại là cùng một thao tác, server quyết định thế hệ mã và thu hồi mã cũ. Qua mọi cửa sổ giới hạn theo tài khoản rồi gọi
     * {@code service.enqueue}.
     *
     * @param body      {@link Request} tùy chọn chứa locale
     * @param principal người dùng từ JWT
     * @return {@code 202} với {@link RequestResponse} ({@code QUEUED})
     * @throws BusinessException {@code EMAIL_VERIFICATION_UNAVAILABLE}, {@code RATE_LIMITED}, {@code EMAIL_ALREADY_VERIFIED},
     *         {@code EMAIL_VERIFICATION_NOT_APPLICABLE}
     */
    @PostMapping("/requests")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<RequestResponse> request(@Valid @RequestBody(required=false) Request body,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        Long userId=CustomUserPrincipal.requireUserId(principal);
        if(!config.ready()) throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_UNAVAILABLE);
        var outcome=operational(()->{
            // Every window must admit the request: 60 s cooldown, then the short and daily caps.
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

    /**
     * {@code POST /api/v1/auth/email-verification/confirm} (công khai): xác nhận mã trong liên kết email; mã, không phải client,
     * xác định tài khoản. Giới hạn theo IP rồi gọi {@code service.verify}.
     *
     * @param body    {@link Confirm} chứa mã
     * @param request request HTTP (lấy IP)
     * @return {@code 204 No Content}
     * @throws BusinessException {@code RATE_LIMITED}, {@code EMAIL_VERIFICATION_INVALID}, {@code EMAIL_VERIFICATION_UNAVAILABLE}
     */
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

    /**
     * Chạy tác vụ và đổi mọi lỗi hạ tầng (không phải {@link BusinessException}) thành {@code EMAIL_VERIFICATION_UNAVAILABLE}.
     *
     * @param work tác vụ
     * @return kết quả của tác vụ
     */
    private <T> T operational(java.util.function.Supplier<T> work) {
        try { return work.get(); }
        catch(BusinessException e) { throw e; }
        catch(RuntimeException e) { throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_UNAVAILABLE); }
    }

    /**
     * Body tùy chọn của yêu cầu gửi mail.
     *
     * @param locale ngôn ngữ email ({@code vi} hoặc {@code en})
     */
    public record Request(@Pattern(regexp="vi|en") String locale) { }
    /**
     * Body của {@code POST .../confirm}.
     *
     * @param credential mã xác minh, bắt buộc, tối đa 128 ký tự; toString được che
     */
    public record Confirm(@NotBlank @Size(max=128) String credential) {
        @Override public String toString() { return "EmailVerificationConfirm[redacted]"; }
    }
    /**
     * Phản hồi của yêu cầu gửi mail.
     *
     * @param status trạng thái, hiện luôn là {@code QUEUED}
     */
    public record RequestResponse(String status) { }
    /**
     * Phản hồi của {@code GET /api/v1/auth/email-verification}.
     *
     * @param verified         email đã được xác minh chưa
     * @param verifiedAt       thời điểm xác minh, hoặc {@code null}
     * @param requestAvailable có thể yêu cầu gửi mail xác minh lúc này không
     * @param lastRequestState trạng thái yêu cầu gần nhất ({@code QUEUED}, {@code PROVIDER_ACCEPTED}, {@code FAILED}, {@code SKIPPED}) hoặc {@code null}
     * @param lastRequestedAt  thời điểm yêu cầu gần nhất, hoặc {@code null}
     */
    public record StatusResponse(boolean verified,LocalDateTime verifiedAt,boolean requestAvailable,
            String lastRequestState,LocalDateTime lastRequestedAt) { }
}
