package com.legacyvault.auth.repository;

import com.legacyvault.auth.entity.GoogleLoginCredentialUse;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;

public interface GoogleLoginCredentialUseRepository extends JpaRepository<GoogleLoginCredentialUse, String> {
    int deleteByExpiresAtLessThanEqual(LocalDateTime now);
}
