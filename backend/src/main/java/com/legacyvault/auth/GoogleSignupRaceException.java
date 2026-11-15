package com.legacyvault.auth;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/**
 * Ngoại lệ báo hiệu "đua tạo tài khoản Google": một request song song đã tạo tài khoản cho email/subject này trước,
 * nên transaction của request hiện tại bị rollback. Điều đó không có nghĩa email thuộc một tài khoản mật khẩu,
 * vì vậy caller ({@link AuthController#googleLogin}) bắt và thử lại một lần thay vì bảo người dùng
 * "đăng nhập bằng mật khẩu" (người thắng thường là chính người dùng Google đó và không có mật khẩu). Nếu vẫn bị
 * lộ ra ngoài thì nó vẫn ánh xạ sang {@code GOOGLE_EMAIL_ALREADY_REGISTERED}.
 */
class GoogleSignupRaceException extends BusinessException {
    GoogleSignupRaceException() {
        super(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED);
    }
}
