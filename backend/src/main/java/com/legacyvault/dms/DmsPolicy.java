package com.legacyvault.dms;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DmsPolicy {
	private static final int GRACE_PERIOD_DAYS = 1;
	private final int minIntervalDays;
	private final int maxIntervalDays;

	public DmsPolicy(@Value("${legacyvault.dms.check-interval-min-days:1}") int minIntervalDays,
			@Value("${legacyvault.dms.check-interval-max-days:32767}") int maxIntervalDays) {
		if (minIntervalDays < 1 || maxIntervalDays < minIntervalDays || maxIntervalDays > 32767) {
			throw new IllegalArgumentException("Invalid DMS policy configuration");
		}
		this.minIntervalDays = minIntervalDays;
		this.maxIntervalDays = maxIntervalDays;
	}

	public boolean allowsInterval(int days) {
		return days >= minIntervalDays && days <= maxIntervalDays;
	}

	public int gracePeriodDays() {
		return GRACE_PERIOD_DAYS;
	}
}
