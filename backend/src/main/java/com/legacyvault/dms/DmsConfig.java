package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Entity JPA ánh xạ bảng {@code dbo.dms_configs}: cấu hình "công tắc người chết" (Dead Man's Switch - DMS) của một
 * chủ két. Mỗi chủ sở hữu có tối đa một dòng (ràng buộc unique ở DB).
 *
 * <p>Vòng đời trạng thái: {@code MONITORING} (đang theo dõi, chờ chủ két check-in trước {@code nextCheckAt})
 * -> {@code TRIGGERED} (quá hạn check-in, bắt đầu thời gian gia hạn tới {@code graceDeadline}; job
 * {@link DmsTriggerProcessor#triggerIfExpired}) -> {@code GRACE_PERIOD_EXCEEDED} (hết gia hạn, mở vụ xác minh;
 * {@link DmsTriggerProcessor#processGracePeriodExpired}). Chủ két check-in kịp thì quay lại {@code MONITORING}
 * (xem {@link DmsService}). Thời gian lưu theo UTC; chu kỳ và gia hạn lưu dưới dạng phút (cột ngày giữ cho dữ liệu cũ).
 */
@Entity
@Table(name = "dms_configs", schema = "dbo")
public class DmsConfig {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "dms_id")
	/** Khóa chính tự tăng của cấu hình DMS (cột {@code dms_id}). */
	private Long id;

	@Column(name = "owner_user_id", nullable = false)
	/** Id chủ két (bảng {@code users}); unique, mỗi chủ có một cấu hình. */
	private Long ownerUserId;

	@Column(name = "check_interval_days")
	/** Chu kỳ check-in tính bằng ngày; null nếu chu kỳ không chia hết cho 1440 phút. */
	private Integer checkIntervalDays;
	@Column(name = "check_interval_minutes")
	/** Chu kỳ check-in tính bằng phút (null với dòng cũ, khi đó suy từ số ngày). */
	private Integer checkIntervalMinutes;

	@Column(name = "grace_period_days", nullable = false)
	/** Thời gian gia hạn (ngày) sau khi bị kích hoạt, trước khi mở vụ xác minh. */
	private int gracePeriodDays;

	@Column(name = "grace_period_minutes")
	/** Thời gian gia hạn tính bằng phút; null là dòng cũ, bằng đúng {@code gracePeriodDays * 1440}. */
	private Integer gracePeriodMinutes;

	@Column(name = "status", nullable = false, length = 30)
	/** Trạng thái: {@code MONITORING}, {@code TRIGGERED} hoặc {@code GRACE_PERIOD_EXCEEDED}. */
	private String status;

	@Column(name = "last_check_in_at")
	/** Thời điểm check-in gần nhất (UTC), null nếu chưa check-in lần nào kể từ lần cấu hình. */
	private LocalDateTime lastCheckInAt;

	@Column(name = "next_check_at")
	/** Hạn check-in kế tiếp (UTC); quá hạn này job sẽ kích hoạt DMS. */
	private LocalDateTime nextCheckAt;

	@Column(name = "triggered_at")
	/** Thời điểm DMS bị kích hoạt (UTC), null khi đang {@code MONITORING}. */
	private LocalDateTime triggeredAt;

	@Column(name = "grace_period_ends_at")
	/** Hạn cuối của thời gian gia hạn (cột {@code grace_period_ends_at}), null khi chưa kích hoạt. */
	private LocalDateTime graceDeadline;

	@Column(name = "updated_at", nullable = false)
	/** Thời điểm cập nhật cuối (UTC), tự gán khi tạo/cập nhật. */
	private LocalDateTime updatedAt;

	/** Constructor không tham số bắt buộc của JPA. */
	protected DmsConfig() { }

	/**
	 * Tạo cấu hình mới ở trạng thái {@code MONITORING}.
	 *
	 * @param ownerUserId     id chủ két
	 * @param checkIntervalDays chu kỳ check-in (ngày)
	 * @param gracePeriodDays thời gian gia hạn (ngày)
	 * @param nextCheckAt     hạn check-in đầu tiên (UTC)
	 * @throws ArithmeticException nếu quy đổi sang phút bị tràn số
	 */
	public DmsConfig(Long ownerUserId, int checkIntervalDays, int gracePeriodDays, LocalDateTime nextCheckAt) {
		this.ownerUserId = ownerUserId;
		this.checkIntervalDays = checkIntervalDays;
		this.checkIntervalMinutes = Math.multiplyExact(checkIntervalDays, 1440);
		this.gracePeriodDays = gracePeriodDays;
		this.gracePeriodMinutes = Math.multiplyExact(gracePeriodDays, 1440);
		this.status = "MONITORING";
		this.nextCheckAt = nextCheckAt;
		this.updatedAt = utcNow();
	}

	/**
	 * Current UTC time at microsecond precision. SQL Server datetime2 keeps 100 ns and rounds, while Linux clocks
	 * return nanoseconds; a value computed here and the same value read back would otherwise differ, and a
	 * deadline compared against its own stored copy could land on the wrong side.
	 *
	 * @return giờ UTC hiện tại, đã cắt về micro giây
	 */
	static LocalDateTime utcNow() {
		return LocalDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
	}

	/** Hook JPA trước khi chèn: gán mặc định trạng thái {@code MONITORING} và {@code updatedAt} nếu còn trống. */
	@PrePersist
	void onCreate() {
		if (status == null) status = "MONITORING";
		if (updatedAt == null) updatedAt = utcNow();
	}

	/** Hook JPA trước khi cập nhật: làm mới {@code updatedAt}. */
	@PreUpdate
	void onUpdate() {
		updatedAt = utcNow();
	}

	/** Đặt lại chu kỳ theo ngày (quy đổi sang phút) và đưa về {@code MONITORING}; xem {@link #configureMinutes}. */
	public void configure(int checkIntervalDays, LocalDateTime nextCheckAt) {
		configureMinutes(Math.multiplyExact(checkIntervalDays, 1440), nextCheckAt);
	}

	/**
	 * Factory tạo cấu hình với chu kỳ tính bằng phút và gia hạn tính bằng ngày.
	 *
	 * @param ownerId     id chủ két
	 * @param minutes     chu kỳ check-in (phút)
	 * @param graceDays   gia hạn (ngày)
	 * @param nextCheckAt hạn check-in đầu tiên
	 */
	public static DmsConfig withMinutes(Long ownerId, int minutes, int graceDays, LocalDateTime nextCheckAt) {
		var config = new DmsConfig(ownerId, 1, graceDays, nextCheckAt);
		config.configureMinutes(minutes, nextCheckAt);
		return config;
	}
	/**
	 * Factory tạo cấu hình với cả chu kỳ và gia hạn tính bằng phút; được {@link DmsService#configure} gọi khi chủ két
	 * cấu hình lần đầu.
	 *
	 * @throws IllegalArgumentException nếu số phút nằm ngoài giới hạn cho phép
	 */
	public static DmsConfig withGraceMinutes(Long ownerId, int minutes, int graceMinutes, LocalDateTime nextCheckAt) {
		var config = new DmsConfig(ownerId, 1, 0, nextCheckAt);
		config.configureMinutes(minutes, nextCheckAt);
		config.setGraceMinutes(graceMinutes);
		return config;
	}

	/**
	 * Grace-only change: keeps the check-in cycle (lastCheckInAt/nextCheckAt) untouched.
	 * Đổi riêng thời gian gia hạn (phút) và đồng bộ lại cột ngày.
	 *
	 * @throws IllegalArgumentException nếu nhỏ hơn 0 hoặc lớn hơn {@link #MAX_GRACE_MINUTES}
	 */
	public void setGraceMinutes(int graceMinutes) {
		if (graceMinutes < 0 || graceMinutes > MAX_GRACE_MINUTES) throw new IllegalArgumentException("Invalid DMS grace minutes");
		this.gracePeriodMinutes = graceMinutes;
		this.gracePeriodDays = graceMinutes / 1440;
		this.updatedAt = utcNow();
	}

	/**
	 * Đặt chu kỳ check-in (phút) và khởi động lại chu trình: về {@code MONITORING}, xóa lần check-in, thời điểm kích
	 * hoạt và hạn gia hạn.
	 *
	 * @param minutes     chu kỳ, từ 1 đến 47184480 phút
	 * @param nextCheckAt hạn check-in kế tiếp
	 * @throws IllegalArgumentException nếu số phút ngoài khoảng cho phép
	 */
	public void configureMinutes(int minutes, LocalDateTime nextCheckAt) {
		if (minutes < 1 || minutes > 47184480) throw new IllegalArgumentException("Invalid DMS minutes");
		this.checkIntervalMinutes = minutes;
		this.checkIntervalDays = minutes % 1440 == 0 ? minutes / 1440 : null;
		this.status = "MONITORING";
		this.lastCheckInAt = null;
		this.nextCheckAt = nextCheckAt;
		this.triggeredAt = null;
		this.graceDeadline = null;
		this.updatedAt = utcNow();
	}

	/** Ghi nhận chủ két check-in lúc {@code now}: dời {@code nextCheckAt} thêm một chu kỳ. */
	public void checkIn(LocalDateTime now) {
		this.lastCheckInAt = now;
		this.nextCheckAt = now.plusMinutes(getCheckIntervalMinutes());
		this.updatedAt = now;
	}

	/**
	 * Hủy cảnh báo khi chủ két check-in trong thời gian gia hạn: quay về {@code MONITORING}, xóa dấu vết kích hoạt và
	 * dời {@code nextCheckAt}.
	 */
	public void restoreAfterAlert(LocalDateTime now) {
		this.status = "MONITORING";
		this.lastCheckInAt = now;
		this.nextCheckAt = now.plusMinutes(getCheckIntervalMinutes());
		this.triggeredAt = null;
		this.graceDeadline = null;
		this.updatedAt = now;
	}

	/** Thời gian gia hạn tối đa: 30 ngày (tính bằng phút). */
	public static final int MAX_GRACE_MINUTES = 30 * 1440;
	/** Trạng thái đang theo dõi check-in. */
	public static final String STATUS_MONITORING = "MONITORING";
	/** Trạng thái đã quá hạn check-in, đang trong thời gian gia hạn. */
	public static final String STATUS_TRIGGERED = "TRIGGERED";
	/** Trạng thái đã hết gia hạn, vụ xác minh đã được mở. */
	public static final String STATUS_GRACE_PERIOD_EXCEEDED = "GRACE_PERIOD_EXCEEDED";

	/** @return {@code true} nếu đang {@code TRIGGERED} và {@code graceDeadline} đã tới hoặc qua {@code now} */
	public boolean isGracePeriodExpired(LocalDateTime now) {
		return STATUS_TRIGGERED.equals(status)
				&& graceDeadline != null
				&& !graceDeadline.isAfter(now);
	}

	/**
	 * Chuyển sang {@code GRACE_PERIOD_EXCEEDED} (bước ST-08).
	 *
	 * @throws IllegalStateException nếu thời gian gia hạn chưa hết
	 */
	public void markGracePeriodExceeded(LocalDateTime now) {
		if (!isGracePeriodExpired(now)) {
			throw new IllegalStateException("Grace Period has not expired");
		}

		this.status = STATUS_GRACE_PERIOD_EXCEEDED;
		this.updatedAt = now;
	}

	/** Các getter bên dưới trả về giá trị của các cột tương ứng; entity chỉ được đổi qua các phương thức nghiệp vụ ở trên. */
	public Long getId() { return id; }
	public Long getOwnerUserId() { return ownerUserId; }
	public Integer getCheckIntervalDays() { return checkIntervalDays; }
	/** Chu kỳ check-in (phút); với dòng cũ thiếu cột phút thì suy từ số ngày. */
	public int getCheckIntervalMinutes() { return checkIntervalMinutes != null ? checkIntervalMinutes : Math.multiplyExact(checkIntervalDays, 1440); }
	public int getGracePeriodDays() { return gracePeriodDays; }
	/** Thời gian gia hạn (phút). NULL column = legacy row, exactly gracePeriodDays * 1440. */
	public int getGracePeriodMinutes() { return gracePeriodMinutes != null ? gracePeriodMinutes : Math.multiplyExact(gracePeriodDays, 1440); }
	public String getStatus() { return status; }
	public LocalDateTime getLastCheckInAt() { return lastCheckInAt; }
	public LocalDateTime getNextCheckAt() { return nextCheckAt; }
	public LocalDateTime getTriggeredAt() { return triggeredAt; }
	public LocalDateTime getGraceDeadline() { return graceDeadline; }
	public LocalDateTime getUpdatedAt() { return updatedAt; }
}
