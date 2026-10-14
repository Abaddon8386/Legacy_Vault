package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

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

	@Scheduled(fixedDelayString = "${legacyvault.dms.scheduler.fixed-delay-ms:60000}")
	public void scanExpiredConfigs() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		List<Long> expiredIds = configs.findExpiredIds(now, PageRequest.of(0, BATCH_SIZE));
		for (Long configId : expiredIds) {
			try {
				processor.triggerIfExpired(configId, now);
			} catch (RuntimeException ex) {
				log.error("DMS scan skipped one config; configId={}, causeType={}", configId,
						ex.getClass().getSimpleName());
			}
		}
	}
}
