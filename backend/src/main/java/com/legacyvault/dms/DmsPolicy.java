package com.legacyvault.dms;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DmsPolicy {
	private final int minIntervalDays;
	private final int maxIntervalDays;
	private final int gracePeriodDays;

	public DmsPolicy(@Value("${legacyvault.dms.check-interval-min-days:1}") int minIntervalDays,
			@Value("${legacyvault.dms.check-interval-max-days:32767}") int maxIntervalDays,
			@Value("${legacyvault.dms.grace-period-days:1}") int gracePeriodDays) {
		if (minIntervalDays < 1 || maxIntervalDays < minIntervalDays || maxIntervalDays > 32767) {
			throw new IllegalArgumentException("Invalid DMS policy configuration");
		}
		if (gracePeriodDays < 0 || gracePeriodDays > 32767) {
			throw new IllegalArgumentException("DMS grace period must fit the database SMALLINT range");
		}
		this.minIntervalDays = minIntervalDays;
		this.maxIntervalDays = maxIntervalDays;
		this.gracePeriodDays = gracePeriodDays;
	}

	public boolean allowsInterval(int days) {
		return days >= minIntervalDays && days <= maxIntervalDays;
	}

	public int gracePeriodDays() {
		return gracePeriodDays;
	}
}
