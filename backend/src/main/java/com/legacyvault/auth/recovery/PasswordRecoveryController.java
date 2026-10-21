package com.legacyvault.auth.recovery;

import com.legacyvault.auth.EmailNormalizer;
import com.legacyvault.auth.policy.ValidPassword;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth/password-recovery")
public class PasswordRecoveryController {
    private final RecoveryConfiguration config;
    private final RecoveryRateLimiter limits;
    private final PasswordRecoveryService service;
    public PasswordRecoveryController(RecoveryConfiguration config,RecoveryRateLimiter limits,PasswordRecoveryService service) {
        this.config=config; this.limits=limits; this.service=service;
    }
    @PostMapping("/requests")
    public ResponseEntity<?> request(@Valid @RequestBody Request body,HttpServletRequest request) {
        if(!config.ready()) throw new BusinessException(ErrorCode.RECOVERY_UNAVAILABLE);
        operational(()->{
            if(!limits.allow("request-ip",request.getRemoteAddr(),20,900)) throw new Limited();
        });
        String email=EmailNormalizer.normalize(body.email());
        boolean allowed;
        try {
            allowed=limits.allow("email-cooldown",email,1,60) && limits.allow("email-quarter",email,3,900)
                    && limits.allow("email-day",email,5,86400);
            if(allowed) service.enqueue(email,body.locale());
        } catch(RuntimeException e) { throw new BusinessException(ErrorCode.RECOVERY_UNAVAILABLE); }
        return ResponseEntity.accepted().header("Cache-Control","no-store")
                .body(java.util.Map.of("messageKey","auth.recovery.requestAccepted"));
    }
    @PostMapping("/reset")
    public ResponseEntity<Void> reset(@Valid @RequestBody Reset body,HttpServletRequest request) {
        operational(()->{
            if(!limits.allow("reset-ip",request.getRemoteAddr(),30,900)
                    || !limits.allow("reset-credential",body.credential(),5,60)) throw new Limited();
            service.reset(body.credential(),body.password());
        });
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
    private void operational(Runnable work) {
        try { work.run(); }
        catch(BusinessException e) { throw e; }
        catch(RuntimeException e) { throw new BusinessException(ErrorCode.RECOVERY_UNAVAILABLE); }
    }
    public static class Limited extends BusinessException {
        public Limited() { super(ErrorCode.RATE_LIMITED); }
    }
    public record Request(@NotBlank @Email @Size(max=254) String email,@Pattern(regexp="vi|en") String locale) {
        @Override public String toString() { return "RecoveryRequest[redacted]"; }
    }
    public record Reset(@NotBlank @Size(max=128) String credential,@ValidPassword String password) {
        @Override public String toString() { return "RecoveryReset[redacted]"; }
    }
}
