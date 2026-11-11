
package com.legacyvault.user.repository;

import com.legacyvault.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.userId = :id and u.status = 'ACTIVE' and u.deletedAt is null")
    Optional<User> findActiveAccountForUpdate(@Param("id") Long id);

    /** Row lock for admin state changes; unlike the ACTIVE-only variant it also finds LOCKED and PENDING accounts. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.userId = :id and u.deletedAt is null")
    Optional<User> findLiveAccountForUpdate(@Param("id") Long id);

    boolean existsByEmail(String email);

    boolean existsByEmailAndUserIdNot(String email, Long userId);

    Optional<User> findByEmail(String email);

    Optional<User> findByPublicId(UUID publicId);

    @Query("""
            select distinct u from User u
            where (:query is null or lower(u.fullName) like lower(concat('%', :query, '%'))
                   or lower(u.email) like lower(concat('%', :query, '%'))
                   or (:hasUuid = true and u.publicId = :queryUuid))
              and (:roleCode is null or exists (
                   select ur.id from UserRole ur join ur.role r
                   where ur.user.userId = u.userId and upper(r.roleCode) = :roleCode))
              and u.deletedAt is null
              and upper(u.status) <> 'PENDING'
              and (:status is null
                   or (:status = 'ARCHIVED' and exists (
                        select v.vaultId from Vault v where v.ownerUserId = u.userId and v.status = 'ARCHIVED'))
                   or (:status = 'HANDOVER_IN_PROGRESS' and exists (
                        select v.vaultId from Vault v
                        where v.ownerUserId = u.userId and v.status in :handoverStatuses))
                   or (:status not in ('ARCHIVED', 'HANDOVER_IN_PROGRESS')
                        and upper(u.status) = :status
                        and not exists (
                            select v.vaultId from Vault v
                            where v.ownerUserId = u.userId
                              and (v.status = 'ARCHIVED' or v.status in :handoverStatuses))))
            """)
    Page<User> searchForAdmin(@Param("query") String query,
                              @Param("hasUuid") boolean hasUuid,
                              @Param("queryUuid") UUID queryUuid,
                              @Param("roleCode") String roleCode,
                              @Param("status") String status,
                              @Param("handoverStatuses") Collection<String> handoverStatuses,
                              Pageable pageable);
}
