package com.legacyvault.auth.repository;

import com.legacyvault.auth.entity.GoogleLoginCredentialUse;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;

public interface GoogleLoginCredentialUseRepository extends JpaRepository<GoogleLoginCredentialUse, String> {
    /**
     * Xóa các marker token đã hết hạn (token hết hạn không thể bị dùng lại nên không cần giữ).
     * @return số bản ghi đã xóa
     */
    int deleteByExpiresAtLessThanEqual(LocalDateTime now);
}
