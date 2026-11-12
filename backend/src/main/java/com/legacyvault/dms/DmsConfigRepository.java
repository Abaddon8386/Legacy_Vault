package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

/**
 * Repository Spring Data JPA cho {@link DmsConfig} (bảng {@code dms_configs}). Được {@link DmsService} (API chủ két),
 * {@link DmsScanJob} và {@link DmsTriggerProcessor} (job nền) sử dụng. Các truy vấn "ForUpdate" dùng khóa ghi
 * bi quan để thao tác và audit được commit nguyên khối.
 */
public interface DmsConfigRepository extends JpaRepository<DmsConfig, Long> {
	/** Tìm cấu hình DMS của một chủ két (không khóa), dùng cho thao tác chỉ đọc. */
	Optional<DmsConfig> findByOwnerUserId(Long ownerUserId);

	/**
	 * Tìm cấu hình theo chủ két và khóa ghi dòng ({@code PESSIMISTIC_WRITE}).
	 * Holds the row lock until the Owner operation and its audit commit together.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select d from DmsConfig d where d.ownerUserId = :ownerUserId")
	Optional<DmsConfig> findByOwnerUserIdForUpdate(@Param("ownerUserId") Long ownerUserId);

	/**
	 * ST-07 candidates: id các cấu hình {@code MONITORING} đã quá {@code nextCheckAt}, cũ nhất trước.
	 * {@link DmsTriggerProcessor#triggerIfExpired} leaves a config untouched when its Vault is ARCHIVED,
	 * so such a config would stay at the head of this oldest-first page on every scan and, with a full batch of them,
	 * starve every other config. They are left out here; a Vault without a row is still listed because the processor
	 * triggers it. This is only a pre-filter: the processor re-checks everything under the Vault and DMS locks.
	 *
	 * @param now      thời điểm quét (UTC)
	 * @param pageable giới hạn số bản ghi mỗi lượt
	 */
	@Query("""
    select d.id from DmsConfig d
    where d.status = 'MONITORING' and d.nextCheckAt <= :now
      and not exists (select 1 from Vault v where v.ownerUserId = d.ownerUserId and v.status = 'ARCHIVED')
    order by d.nextCheckAt
    """)
	List<Long> findExpiredIds(@Param("now") LocalDateTime now, Pageable pageable);

	/**
	 * Cập nhật có điều kiện (chống chạy trùng): chuyển cấu hình sang {@code TRIGGERED}, ghi {@code triggeredAt} và
	 * {@code graceDeadline}, chỉ khi vẫn đang {@code MONITORING} và đã quá hạn.
	 *
	 * @param id            id cấu hình
	 * @param triggeredAt   thời điểm kích hoạt (UTC)
	 * @param graceDeadline hạn cuối gia hạn
	 * @return số dòng được cập nhật (1 nếu thành công, 0 nếu đã bị xử lý bởi luồng khác)
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("update DmsConfig d set d.status = 'TRIGGERED', d.triggeredAt = :triggeredAt, "
			+ "d.graceDeadline = :graceDeadline, d.updatedAt = :triggeredAt "
			+ "where d.id = :id and d.status = 'MONITORING' and d.nextCheckAt <= :triggeredAt")
	int triggerIfExpired(@Param("id") Long id, @Param("triggeredAt") LocalDateTime triggeredAt,
			@Param("graceDeadline") LocalDateTime graceDeadline);

	/**
	 * ST-08/ST-09 candidates: id các cấu hình {@code TRIGGERED} đã hết gia hạn, theo {@code graceDeadline}.
	 * {@link DmsTriggerProcessor#processGracePeriodExpired} changes nothing when the owner has no
	 * Vault, the Vault is not ACTIVE, or an OPEN case already exists for it, so such a config stays TRIGGERED and would
	 * be scanned again every cycle; 100 of them would fill the whole batch and block the configs that can proceed. Only
	 * configs that can enter verification are listed. The check is state based, so a config is listed again as soon as
	 * its Vault is ACTIVE again with no OPEN case, and nothing is changed or deleted here. The processor still
	 * re-checks everything under the Vault and DMS locks, so this is a pre-filter and not the authority.
	 *
	 * @param now      thời điểm quét (UTC)
	 * @param pageable giới hạn số bản ghi mỗi lượt
	 */
	@Query("""
    select d.id from DmsConfig d
    where d.status = 'TRIGGERED'
      and d.graceDeadline is not null
      and d.graceDeadline <= :now
      and exists (select 1 from Vault v where v.ownerUserId = d.ownerUserId and v.status = 'ACTIVE'
                  and not exists (select 1 from VerificationCase c where c.vaultId = v.vaultId and c.status = 'OPEN'))
    order by d.graceDeadline
    """)
	List<Long> findGracePeriodExpiredIds(
			@Param("now") LocalDateTime now,
			Pageable pageable
	);

	/** Tìm cấu hình theo id và khóa ghi dòng, dùng khi xử lý hết gia hạn trong {@link DmsTriggerProcessor}. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select d from DmsConfig d where d.id = :id")
	Optional<DmsConfig> findByIdForUpdate(@Param("id") Long id);
}
