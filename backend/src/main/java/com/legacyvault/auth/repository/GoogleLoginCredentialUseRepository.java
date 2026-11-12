package com.legacyvault.auth.repository;

import com.legacyvault.auth.entity.GoogleLoginCredentialUse;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;

/**
 * Repository cho bảng {@code dbo.google_login_credential_uses}; được {@link com.legacyvault.auth.GoogleAuthService}
 * dùng để ghi dấu token đã dùng và dọn dẹp.
 */
public interface GoogleLoginCredentialUseRepository extends JpaRepository<GoogleLoginCredentialUse, String> {
    /**
     * Xóa các dấu token đã hết hạn.
     *
     * @param now mốc thời gian (UTC); xóa mọi dòng có {@code expires_at <= now}
     * @return số dòng đã xóa
     */
    int deleteByExpiresAtLessThanEqual(LocalDateTime now);
}
