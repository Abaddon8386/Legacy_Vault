package com.legacyvault.auth.emailverification;

/**
 * Ranh giới gửi mã xác minh email. Cài đặt hiện có: {@link ResendEmailVerificationMailTransport}. Một lần trả về bình thường
 * chỉ nghĩa là nhà cung cấp đã nhận; không bao giờ log người nhận, mã hay nội dung.
 */
public interface EmailVerificationMailTransport {
    /**
     * Gửi mã xác minh.
     *
     * @param recipient  địa chỉ nhận
     * @param locale     ngôn ngữ ({@code vi}/{@code en})
     * @param credential mã xác minh dạng thô
     */
    void send(String recipient, String locale, String credential);
}
