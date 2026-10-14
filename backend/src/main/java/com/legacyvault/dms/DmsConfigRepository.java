package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DmsConfigRepository extends JpaRepository<DmsConfig, Long> {
	Optional<DmsConfig> findByOwnerUserId(Long ownerUserId);

	@Query("select d.id from DmsConfig d where d.status = 'MONITORING' and d.nextCheckAt <= :now order by d.nextCheckAt")
	List<Long> findExpiredIds(@Param("now") LocalDateTime now, Pageable pageable);

	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("update DmsConfig d set d.status = 'TRIGGERED', d.triggeredAt = :triggeredAt, "
			+ "d.graceDeadline = :graceDeadline, d.updatedAt = :triggeredAt "
			+ "where d.id = :id and d.status = 'MONITORING' and d.nextCheckAt <= :triggeredAt")
	int triggerIfExpired(@Param("id") Long id, @Param("triggeredAt") LocalDateTime triggeredAt,
			@Param("graceDeadline") LocalDateTime graceDeadline);
}
