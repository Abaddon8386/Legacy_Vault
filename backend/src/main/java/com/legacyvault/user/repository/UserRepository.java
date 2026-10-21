
package com.legacyvault.user.repository;

import com.legacyvault.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.userId = :id and u.status = 'ACTIVE' and u.deletedAt is null")
    Optional<User> findActiveAccountForUpdate(@Param("id") Long id);

    boolean existsByEmail(String email);

    boolean existsByEmailAndUserIdNot(String email, Long userId);

    Optional<User> findByEmail(String email);

    Optional<User> findByPublicId(UUID publicId);
}
