package com.legacyvault.dms;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Chính sách giới hạn của DMS, đọc từ cấu hình: {@code legacyvault.dms.check-interval-min-days} (mặc định 1),
 * {@code legacyvault.dms.check-interval-max-days} (mặc định 180) và {@code legacyvault.dms.grace-period-days}
 * (mặc định 1). Được {@link DmsService} dùng để kiểm tra và quy đổi chu kỳ/gia hạn của request cấu hình.
 */
@Component
public class DmsPolicy {
	private final int minIntervalDays;
	private final int maxIntervalDays;
	private final int gracePeriodDays;

	/**
	 * @throws IllegalArgumentException nếu cấu hình sai (chu kỳ nhỏ nhất dưới 1, lớn nhất nhỏ hơn nhỏ nhất hoặc vượt 32767, gia hạn ngoài 0..30 ngày)
	 */
	public DmsPolicy(@Value("${legacyvault.dms.check-interval-min-days:1}") int minIntervalDays,
			@Value("${legacyvault.dms.check-interval-max-days:180}") int maxIntervalDays,
			@Value("${legacyvault.dms.grace-period-days:1}") int gracePeriodDays) {
		if (minIntervalDays < 1 || maxIntervalDays < minIntervalDays || maxIntervalDays > 32767) {
			throw new IllegalArgumentException("Invalid DMS policy configuration");
		}
		if (gracePeriodDays < 0 || gracePeriodDays > 30) {
			throw new IllegalArgumentException("DMS grace period must be between 0 and 30 days");
		}
		this.minIntervalDays = minIntervalDays;
		this.maxIntervalDays = maxIntervalDays;
		this.gracePeriodDays = gracePeriodDays;
	}

	/** @return {@code true} nếu số ngày nằm trong khoảng cho phép (và không vượt 180 ngày) */
	public boolean allowsInterval(int days) {
		return days >= minIntervalDays && days <= Math.min(maxIntervalDays, 180);
	}

	/**
	 * Quy đổi chu kỳ check-in của request ra phút. Phải có đúng một trong {@code checkIntervalDays} hoặc
	 * {@code checkIntervalMinutes}; ngày phải thỏa {@link #allowsInterval}, phút trong 1..259200.
	 *
	 * @param request request cấu hình
	 * @return chu kỳ tính bằng phút
	 * @throws com.legacyvault.common.error.BusinessException {@code VALIDATION_FAILED} nếu không hợp lệ
	 */
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
	/** Tạo lỗi {@code VALIDATION_FAILED} dùng chung. */
	private static com.legacyvault.common.error.BusinessException invalid() {
		return new com.legacyvault.common.error.BusinessException(com.legacyvault.common.error.ErrorCode.VALIDATION_FAILED);
	}

	/**
	 * Quy đổi gia hạn của request ra phút; trả về null khi request không gửi trường gia hạn nào.
	 * Không được gửi đồng thời ngày và phút; ngày 0..30, phút 0..{@link DmsConfig#MAX_GRACE_MINUTES}.
	 *
	 * @throws com.legacyvault.common.error.BusinessException {@code VALIDATION_FAILED} nếu không hợp lệ
	 */
	public Integer resolveGraceMinutes(DmsDtos.ConfigureRequest request) {
		if (request.gracePeriodDays() == null && request.gracePeriodMinutes() == null) return null;
		if (request.gracePeriodDays() != null && request.gracePeriodMinutes() != null) throw invalid();
		if (request.gracePeriodDays() != null) {
			if (request.gracePeriodDays() < 0 || request.gracePeriodDays() > 30) throw invalid();
			return Math.multiplyExact(request.gracePeriodDays(), 1440);
		}
		int minutes = request.gracePeriodMinutes();
		if (minutes < 0 || minutes > DmsConfig.MAX_GRACE_MINUTES) throw invalid();
		return minutes;
	}

	/** Thời gian gia hạn mặc định (phút) theo cấu hình, dùng khi request không gửi gia hạn. */
	public int gracePeriodMinutes() {
		return Math.multiplyExact(gracePeriodDays, 1440);
	}

	/** Thời gian gia hạn mặc định (ngày) theo cấu hình. */
	public int gracePeriodDays() {
		return gracePeriodDays;
	}
}
