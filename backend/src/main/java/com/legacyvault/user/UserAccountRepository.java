package com.legacyvault.user;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
	Optional<UserAccount> findByPublicIdAndDeletedAtIsNull(UUID publicId);
}
