package com.legacyvault.dms;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DmsPolicy {
	private final int minIntervalDays;
	private final int maxIntervalDays;
	private final int gracePeriodDays;

	public DmsPolicy(@Value("${legacyvault.dms.check-interval-min-days:1}") int minIntervalDays,
			@Value("${legacyvault.dms.check-interval-max-days:180}") int maxIntervalDays,
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
		return days >= minIntervalDays && days <= Math.min(maxIntervalDays, 180);
	}

	public int resolveMinutes(DmsDtos.ConfigureRequest request) {
		if (request == null || (request.checkIntervalDays() == null) == (request.checkIntervalMinutes() == null))
			throw new com.legacyvault.common.error.BusinessException(com.legacyvault.common.error.ErrorCode.VALIDATION_FAILED);
		if (request.checkIntervalDays() != null) {
			if (!allowsInterval(request.checkIntervalDays())) throw invalid();
			return Math.multiplyExact(request.checkIntervalDays(), 1440);
		}
		int minutes = request.checkIntervalMinutes();
		if (minutes < 1 || minutes > 259200) throw invalid();
		return minutes;
	}
	private static com.legacyvault.common.error.BusinessException invalid() {
		return new com.legacyvault.common.error.BusinessException(com.legacyvault.common.error.ErrorCode.VALIDATION_FAILED);
	}

	public int gracePeriodDays() {
		return gracePeriodDays;
	}
}
