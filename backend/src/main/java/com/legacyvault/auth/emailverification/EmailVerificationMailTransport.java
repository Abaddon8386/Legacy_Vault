package com.legacyvault.auth.emailverification;

/**
 * Ranh giới gửi credential xác minh. Hiện chưa có bản cài đặt production: lựa chọn link hay mã,
 * allowlist redirect và cấu hình nhà cung cấp chưa được duyệt. Bản cài đặt chỉ được coi việc trả về bình thường
 * là "nhà cung cấp đã nhận", và tuyệt đối không ghi log người nhận, credential hay nội dung thư.
 */
public interface EmailVerificationMailTransport {
    /**
     * Gửi thư xác minh. Trả về bình thường chỉ có nghĩa nhà cung cấp đã nhận thư.
     * @param credential credential thô để nhúng vào link; tuyệt đối không ghi log
     */
    void send(String recipient, String locale, String credential);
}
