package com.legacyvault.auth.emailverification;

import com.legacyvault.auth.recovery.ResendRecoveryMailTransport;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Gửi email xác minh qua lời gọi Resend sẵn có (API key, sender và allowlist người nhận dùng chung với khôi phục mật khẩu). Trả về
 * bình thường chỉ nghĩa là nhà cung cấp đã nhận. Không log người nhận, liên kết hay nội dung.
 */
@Component
@ConditionalOnProperty(name="legacyvault.auth.email-verification.delivery-enabled",havingValue="true")
public class ResendEmailVerificationMailTransport implements EmailVerificationMailTransport {
    /**
     * Cấu hình xác minh (TTL, liên kết).
     */
    private final EmailVerificationConfiguration config;
    /**
     * Cài đặt Resend dùng chung.
     */
    private final ResendRecoveryMailTransport resend;
    /**
     * @param config cấu hình xác minh
     * @param resend kênh Resend dùng chung
     */
    public ResendEmailVerificationMailTransport(EmailVerificationConfiguration config,ResendRecoveryMailTransport resend) {
        this.config=config; this.resend=resend;
    }
    /**
     * Soạn tiêu đề và nội dung theo locale (nêu số giờ hết hạn tính từ TTL) rồi gửi qua {@code resend.sendMessage}.
     *
     * @param recipient  địa chỉ nhận
     * @param locale     {@code vi}/{@code en}
     * @param credential mã xác minh
     * @throws IllegalStateException nếu gửi thất bại
     */
    @Override public void send(String recipient,String locale,String credential) {
        boolean en="en".equals(locale);
        long hours=Math.max(1,config.ttlMinutes()/60);
        resend.sendMessage(recipient,en?"Verify your LegacyVault email":"Xác minh email LegacyVault",
                (en?"This link expires in "+hours+" hours. If you did not request it, ignore this email.\n"
                    :"Liên kết hết hạn sau "+hours+" giờ. Bỏ qua email nếu bạn không yêu cầu.\n")+config.link(credential));
    }
}
