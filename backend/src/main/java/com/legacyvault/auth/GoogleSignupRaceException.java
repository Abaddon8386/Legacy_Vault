package com.legacyvault.auth;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/**
 * Ngoại lệ nội bộ cho tình huống đua (race) khi tạo tài khoản Google: một request song song đã tạo tài khoản
 * cho cùng email/subject trước nên transaction này bị rollback. Controller ({@code AuthController.googleLogin})
 * bắt ngoại lệ này và thử lại đúng một lần. Nếu vẫn lọt ra ngoài, ánh xạ về
 * {@code GOOGLE_EMAIL_ALREADY_REGISTERED}.
 */
class GoogleSignupRaceException extends BusinessException {
    /**
     * Tạo ngoại lệ với mã lỗi {@code GOOGLE_EMAIL_ALREADY_REGISTERED}.
     */
    GoogleSignupRaceException() {
        super(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED);
    }
}
