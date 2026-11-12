package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Job nền quét định kỳ cấu hình DMS (bật bởi {@link DmsSchedulingConfiguration}). Mỗi lượt (mặc định cách nhau
 * 60 giây, cấu hình {@code legacyvault.dms.scheduler.fixed-delay-ms}) xử lý tối đa {@code BATCH_SIZE} cấu hình mỗi
 * pha: (1) ST-07 các cấu hình quá hạn check-in thì chuyển sang {@code TRIGGERED}; (2) ST-08/ST-09 các cấu hình hết
 * gia hạn thì mở vụ xác minh. Mỗi cấu hình được xử lý trong transaction riêng của {@link DmsTriggerProcessor};
 * lỗi của một cấu hình chỉ được log, không làm dừng cả lượt.
 */
@Component
public class DmsScanJob {

	/** Logger của job. */
	private static final Logger log = LoggerFactory.getLogger(DmsScanJob.class);
	/** Số cấu hình tối đa xử lý mỗi pha trong một lượt quét. */
	private static final int BATCH_SIZE = 100;

	/** Truy vấn id các cấu hình cần xử lý. */
	private final DmsConfigRepository configs;
	/** Xử lý từng cấu hình trong transaction riêng. */
	private final DmsTriggerProcessor processor;

	/** Nhận repository cấu hình DMS và bộ xử lý kích hoạt. */
	public DmsScanJob(DmsConfigRepository configs, DmsTriggerProcessor processor) {
		this.configs = configs;
		this.processor = processor;
	}

	/**
	 * Một lượt quét: lấy giờ UTC hiện tại, gọi {@code findExpiredIds} rồi {@link DmsTriggerProcessor#triggerIfExpired}
	 * cho từng id; sau đó gọi {@code findGracePeriodExpiredIds} rồi
	 * {@link DmsTriggerProcessor#processGracePeriodExpired}. Ngoại lệ runtime của từng cấu hình được bắt và log (chỉ
	 * ghi tên loại lỗi, không ghi dữ liệu nhạy cảm).
	 */
	@Scheduled(fixedDelayString = "${legacyvault.dms.scheduler.fixed-delay-ms:60000}")
	public void scanExpiredConfigs() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

		List<Long> expiredIds = configs.findExpiredIds(now, PageRequest.of(0, BATCH_SIZE));

		for (Long configId : expiredIds) {
			try {
				processor.triggerIfExpired(configId, now);
			} catch (RuntimeException ex) {
				log.error(
						"DMS trigger processing failed; configId={}, causeType={}",
						configId, ex.getClass().getSimpleName()
				);
			}
		}

		List<Long> graceExpiredIds = configs.findGracePeriodExpiredIds(now, PageRequest.of(0, BATCH_SIZE));

		for (Long configId : graceExpiredIds) {
			try {
				processor.processGracePeriodExpired(configId, now);
			} catch (RuntimeException ex) {
				log.error(
						"Grace Period processing failed; configId={}, causeType={}",
						configId, ex.getClass().getSimpleName()
				);
			}
		}
	}
}
