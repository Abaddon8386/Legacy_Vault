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

@RestController
@RequestMapping("/api/v1/auth/email-verification")
public class EmailVerificationController {
    private final EmailVerificationConfiguration config;
    private final RecoveryRateLimiter limits;
    private final EmailVerificationService service;
    public EmailVerificationController(EmailVerificationConfiguration config,RecoveryRateLimiter limits,EmailVerificationService service) {
        this.config=config; this.limits=limits; this.service=service;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<StatusResponse> status(@AuthenticationPrincipal CustomUserPrincipal principal) {
        var status=operational(()->service.status(CustomUserPrincipal.requireUserId(principal)));
        return ResponseEntity.ok().header("Cache-Control","no-store").body(new StatusResponse(status.verified(),status.verifiedAt(),
                status.requestAvailable(),status.lastRequestState(),status.lastRequestedAt()));
    }

    /** Request and resend are the same call; the server decides generation and what happens to older credentials. */
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

    /** Public: the credential, not the client, identifies the account. */
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
