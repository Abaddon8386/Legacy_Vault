package com.legacyvault.auth.recovery;

/**
 * Cổng gửi mail khôi phục mật khẩu; cài đặt hiện tại là {@link ResendRecoveryMailTransport}.
 */
public interface RecoveryMailTransport {
    /**
     * Gửi liên kết khôi phục. Chỉ chứng minh nhà cung cấp đã nhận, không đảm bảo vào hộp thư. Không ghi log người nhận,
     * URL hay nội dung.
     *
     * @param recipient địa chỉ nhận
     * @param locale    ngôn ngữ ({@code vi}/{@code en})
     * @param credential mã khôi phục dạng thô
     */
    void send(String recipient, String locale, String credential);
}
