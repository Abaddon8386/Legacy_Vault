package com.legacyvault.user.repository;

import com.legacyvault.user.entity.ExternalAuthIdentity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ExternalAuthIdentityRepository extends JpaRepository<ExternalAuthIdentity, Long> {
    Optional<ExternalAuthIdentity> findByProviderCodeAndSubject(String providerCode, String subject);
}
