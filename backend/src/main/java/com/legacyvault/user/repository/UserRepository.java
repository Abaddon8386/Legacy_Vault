
package com.legacyvault.user.repository;

import com.legacyvault.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, Long> {

    boolean existsByEmail(String email);

    Optional<User> findByEmail(String email);

    Optional<User> findByPublicId(UUID publicId);

    @Query("""
            select distinct u from User u
            where (:query is null or lower(u.fullName) like lower(concat('%', :query, '%'))
                   or lower(u.email) like lower(concat('%', :query, '%')))
              and (:roleCode is null or exists (
                   select ur.id from UserRole ur join ur.role r
                   where ur.user.userId = u.userId and upper(r.roleCode) = :roleCode))
              and (:status is null
                   or (:status = 'DELETED' and u.deletedAt is not null)
                   or (:status <> 'DELETED' and u.deletedAt is null and upper(u.status) = :status))
            """)
    Page<User> searchForAdmin(@Param("query") String query,
                              @Param("roleCode") String roleCode,
                              @Param("status") String status,
                              Pageable pageable);
}
