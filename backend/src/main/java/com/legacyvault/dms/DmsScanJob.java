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
 * Job định kỳ quét cấu hình DMS: (1) chuyển cấu hình quá hạn check-in sang TRIGGERED; (2) xử lý cấu hình đã hết Grace Period.
 * Mỗi lượt xử lý tối đa {@code BATCH_SIZE} bản ghi mỗi loại; lỗi của một cấu hình chỉ được ghi log (loại exception) và không chặn các cấu hình còn lại.
 */
@Component
public class DmsScanJob {

	private static final Logger log = LoggerFactory.getLogger(DmsScanJob.class);
	private static final int BATCH_SIZE = 100;

	private final DmsConfigRepository configs;
	private final DmsTriggerProcessor processor;

	public DmsScanJob(DmsConfigRepository configs, DmsTriggerProcessor processor) {
		this.configs = configs;
		this.processor = processor;
	}

	// fixedDelay: lượt sau chỉ bắt đầu sau khi lượt trước kết thúc nên các lượt không chồng nhau trên một instance. Mặc định 60 giây.
	@Scheduled(fixedDelayString = "${legacyvault.dms.scheduler.fixed-delay-ms:60000}")
	public void scanExpiredConfigs() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

		List<Long> expiredIds = configs.findExpiredIds(now, PageRequest.of(0, BATCH_SIZE));

		// Mỗi cấu hình chạy trong transaction riêng của processor, nên lỗi một cấu hình không rollback các cấu hình khác.
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
