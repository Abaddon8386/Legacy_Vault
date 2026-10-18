package com.legacyvault.user.repository;

import com.legacyvault.user.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** Shared serialization point for Vault creation and all Owner content/quota writers. */
public interface OwnerWriteLockRepository extends Repository<User, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select u from User u
        where u.userId = :ownerUserId and u.status = 'ACTIVE' and u.deletedAt is null
        """)
    Optional<User> findActiveOwnerForUpdate(@Param("ownerUserId") Long ownerUserId);
}
