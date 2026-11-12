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

/**
 * Controller khôi phục mật khẩu (quên mật khẩu), gốc {@code /api/v1/auth/password-recovery}; các endpoint công khai.
 * Luồng: người dùng gửi yêu cầu (email được xếp hàng, email gửi bất đồng bộ bởi {@link RecoveryDeliveryWorker}), sau đó
 * dùng mã trong liên kết để đặt mật khẩu mới. Phản hồi không phụ thuộc việc tài khoản có tồn tại hay không (chống dò
 * email). Có giới hạn tốc độ qua {@link RecoveryRateLimiter}.
 */
@RestController
@RequestMapping("/api/v1/auth/password-recovery")
public class PasswordRecoveryController {
    /**
     * Cấu hình gửi email khôi phục; {@code ready()} phải đúng thì tính năng mới hoạt động.
     */
    private final RecoveryConfiguration config;
    /**
     * Bộ giới hạn tốc độ bền vững theo cửa sổ trượt.
     */
    private final RecoveryRateLimiter limits;
    /**
     * Dịch vụ xếp hàng yêu cầu và đặt lại mật khẩu.
     */
    private final PasswordRecoveryService service;
    /**
     * @param config cấu hình khôi phục
     * @param limits bộ giới hạn tốc độ
     * @param service dịch vụ khôi phục
     */
    public PasswordRecoveryController(RecoveryConfiguration config,RecoveryRateLimiter limits,PasswordRecoveryService service) {
        this.config=config; this.limits=limits; this.service=service;
    }
    /**
     * {@code POST /api/v1/auth/password-recovery/requests} (công khai): yêu cầu gửi liên kết đặt lại mật khẩu.
     * Kiểm tra cấu hình sẵn sàng; giới hạn theo IP (20 lần/15 phút); chuẩn hóa email; giới hạn theo email (1/phút, 3/15 phút,
     * 5/ngày); nếu được phép thì xếp hàng qua {@code service.enqueue}. Luôn trả {@code 202 Accepted} dù bị giới hạn theo
     * email hay không, để không lộ tài khoản.
     *
     * @param body    {@link Request} gồm email và locale
     * @param request request HTTP (lấy IP)
     * @return {@code 202} kèm {@code {"messageKey":"auth.recovery.requestAccepted"}}, header {@code Cache-Control: no-store}
     * @throws BusinessException {@code RECOVERY_UNAVAILABLE} (chưa cấu hình/lỗi hạ tầng), {@code RATE_LIMITED} (theo IP)
     */
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
    /**
     * {@code POST /api/v1/auth/password-recovery/reset} (công khai): đặt mật khẩu mới bằng mã khôi phục. Giới hạn theo IP
     * (30/15 phút) và theo mã (5/phút) rồi gọi {@code service.reset}.
     *
     * @param body    {@link Reset} gồm credential và mật khẩu mới
     * @param request request HTTP (lấy IP)
     * @return {@code 204 No Content}, header {@code Cache-Control: no-store}
     * @throws BusinessException {@code RATE_LIMITED}, {@code PASSWORD_POLICY}, {@code RECOVERY_INVALID}, {@code RECOVERY_UNAVAILABLE}
     */
    @PostMapping("/reset")
    public ResponseEntity<Void> reset(@Valid @RequestBody Reset body,HttpServletRequest request) {
        operational(()->{
            if(!limits.allow("reset-ip",request.getRemoteAddr(),30,900)
                    || !limits.allow("reset-credential",body.credential(),5,60)) throw new Limited();
            service.reset(body.credential(),body.password());
        });
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
    /**
     * Chạy tác vụ và gom mọi lỗi hạ tầng (không phải {@link BusinessException}) thành {@code RECOVERY_UNAVAILABLE}
     * để không lộ chi tiết SQL/nhà cung cấp.
     *
     * @param work tác vụ cần chạy
     */
    private void operational(Runnable work) {
        try { work.run(); }
        catch(BusinessException e) { throw e; }
        catch(RuntimeException e) { throw new BusinessException(ErrorCode.RECOVERY_UNAVAILABLE); }
    }
    /**
     * Ngoại lệ báo vượt hạn mức tốc độ, ánh xạ {@code RATE_LIMITED}.
     */
    public static class Limited extends BusinessException {
        public Limited() { super(ErrorCode.RATE_LIMITED); }
    }
    /**
     * Body của {@code POST /api/v1/auth/password-recovery/requests}.
     *
     * @param email  email cần khôi phục, bắt buộc, hợp lệ, tối đa 254 ký tự
     * @param locale ngôn ngữ email ({@code vi} hoặc {@code en}); toString được che để không lộ dữ liệu
     */
    public record Request(@NotBlank @Email @Size(max=254) String email,@Pattern(regexp="vi|en") String locale) {
        @Override public String toString() { return "RecoveryRequest[redacted]"; }
    }
    /**
     * Body của {@code POST /api/v1/auth/password-recovery/reset}.
     *
     * @param credential mã khôi phục lấy từ liên kết, bắt buộc, tối đa 128 ký tự
     * @param password   mật khẩu mới thỏa {@link ValidPassword}; toString được che
     */
    public record Reset(@NotBlank @Size(max=128) String credential,@ValidPassword String password) {
        @Override public String toString() { return "RecoveryReset[redacted]"; }
    }
}
