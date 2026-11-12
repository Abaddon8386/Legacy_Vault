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
	 * Giữ khóa dòng cho đến khi thao tác của Owner và audit của nó cùng commit.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select d from DmsConfig d where d.ownerUserId = :ownerUserId")
	Optional<DmsConfig> findByOwnerUserIdForUpdate(@Param("ownerUserId") Long ownerUserId);

	/**
	 * ST-07 candidates: id các cấu hình {@code MONITORING} đã quá {@code nextCheckAt}, cũ nhất trước.
	 * {@link DmsTriggerProcessor#triggerIfExpired} không đụng tới cấu hình có Vault đã ARCHIVED, nên cấu hình đó sẽ luôn
	 * nằm đầu trang (cũ nhất trước) ở mỗi lượt quét và, nếu đủ một lô như vậy, làm đói mọi cấu hình khác. Vì thế chúng bị
	 * loại ở đây; chủ chưa có Vault vẫn được liệt kê vì bộ xử lý vẫn kích hoạt. Đây chỉ là bộ lọc sơ bộ: bộ xử lý kiểm tra
	 * lại mọi thứ dưới khóa Vault và DMS.
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
	 * {@link DmsTriggerProcessor#processGracePeriodExpired} không đổi gì khi chủ chưa có Vault, Vault không ACTIVE hoặc đã
	 * có vụ OPEN, nên cấu hình đó vẫn ở TRIGGERED và bị quét lại mỗi chu kỳ; 100 cấu hình như vậy sẽ chiếm hết lô và chặn
	 * các cấu hình xử lý được. Vì thế chỉ liệt kê cấu hình có thể vào xác minh. Điều kiện dựa trên trạng thái hiện tại nên
	 * cấu hình được liệt kê lại ngay khi Vault ACTIVE trở lại và không còn vụ OPEN; ở đây không thay đổi hay xóa gì. Bộ xử
	 * lý vẫn kiểm tra lại mọi thứ dưới khóa Vault và DMS, nên đây chỉ là bộ lọc sơ bộ chứ không phải nguồn quyết định.
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
