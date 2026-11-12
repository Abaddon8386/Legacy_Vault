package com.legacyvault.user.repository;

import com.legacyvault.user.entity.ExternalAuthIdentity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Repository cho {@code dbo.external_auth_identities}; được {@code GoogleAuthService} dùng khi đăng nhập/liên kết Google.
 */
public interface ExternalAuthIdentityRepository extends JpaRepository<ExternalAuthIdentity, Long> {
    /**
     * Tìm danh tính theo nhà cung cấp và subject.
     *
     * @param providerCode mã nhà cung cấp (ví dụ {@code GOOGLE})
     * @param subject      subject tại nhà cung cấp
     * @return danh tính nếu đã liên kết
     */
    Optional<ExternalAuthIdentity> findByProviderCodeAndSubject(String providerCode, String subject);
}
