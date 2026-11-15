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
 * Cấu hình và trạng thái Dead Man's Switch (DMS) của một chủ Vault, ánh xạ bảng {@code dbo.dms_configs}.
 *
 * <p>Vòng đời: {@code MONITORING} sang {@code TRIGGERED} (quá hạn check-in, bắt đầu Grace Period) sang {@code GRACE_PERIOD_EXCEEDED}
 * (hết Grace Period, mở vụ xác minh). Chủ Vault check-in hoặc hủy cảnh báo thì quay lại MONITORING.
 * Chu kỳ và Grace Period lưu cả dạng ngày lẫn phút; cột phút null là dữ liệu cũ, quy đổi từ số ngày nhân 1440.
 */
@Entity
@Table(name = "dms_configs", schema = "dbo")
public class DmsConfig {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "dms_id")
	private Long id;

	@Column(name = "owner_user_id", nullable = false)
	private Long ownerUserId;

	@Column(name = "check_interval_days")
	private Integer checkIntervalDays;
	@Column(name = "check_interval_minutes")
	private Integer checkIntervalMinutes;

	@Column(name = "grace_period_days", nullable = false)
	private int gracePeriodDays;

	@Column(name = "grace_period_minutes")
	private Integer gracePeriodMinutes;

	@Column(name = "status", nullable = false, length = 30)
	private String status;

	@Column(name = "last_check_in_at")
	private LocalDateTime lastCheckInAt;

	@Column(name = "next_check_at")
	private LocalDateTime nextCheckAt;

	@Column(name = "triggered_at")
	private LocalDateTime triggeredAt;

	@Column(name = "grace_period_ends_at")
	private LocalDateTime graceDeadline;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	protected DmsConfig() { }

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
	 * Thời gian UTC hiện tại ở độ chính xác microsecond. datetime2 của SQL Server giữ 100 ns và làm tròn, còn đồng hồ Linux
	 * trả nanosecond; giá trị tính ở đây và cùng giá trị đọc lại sẽ khác nhau, và một
	 * deadline so với bản sao đã lưu của chính nó có thể rơi sai phía.
	 */
	static LocalDateTime utcNow() {
		return LocalDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
	}

	@PrePersist
	void onCreate() {
		if (status == null) status = "MONITORING";
		if (updatedAt == null) updatedAt = utcNow();
	}

	@PreUpdate
	void onUpdate() {
		updatedAt = utcNow();
	}

	/**
	 * Đặt lại chu kỳ check-in theo số ngày: quy đổi ra phút rồi khởi động lại vòng theo dõi (xem {@link #configureMinutes}).
	 */
	public void configure(int checkIntervalDays, LocalDateTime nextCheckAt) {
		configureMinutes(Math.multiplyExact(checkIntervalDays, 1440), nextCheckAt);
	}

	/**
	 * Tạo cấu hình mới với chu kỳ tính bằng phút và Grace Period tính bằng ngày.
	 */
	public static DmsConfig withMinutes(Long ownerId, int minutes, int graceDays, LocalDateTime nextCheckAt) {
		var config = new DmsConfig(ownerId, 1, graceDays, nextCheckAt);
		config.configureMinutes(minutes, nextCheckAt);
		return config;
	}
	/**
	 * Tạo cấu hình mới với cả chu kỳ và Grace Period tính bằng phút.
	 */
	public static DmsConfig withGraceMinutes(Long ownerId, int minutes, int graceMinutes, LocalDateTime nextCheckAt) {
		var config = new DmsConfig(ownerId, 1, 0, nextCheckAt);
		config.configureMinutes(minutes, nextCheckAt);
		config.setGraceMinutes(graceMinutes);
		return config;
	}

	/** Thay đổi chỉ Grace: giữ nguyên chu kỳ check-in (lastCheckInAt/nextCheckAt). */
	public void setGraceMinutes(int graceMinutes) {
		if (graceMinutes < 0 || graceMinutes > MAX_GRACE_MINUTES) throw new IllegalArgumentException("Invalid DMS grace minutes");
		this.gracePeriodMinutes = graceMinutes;
		this.gracePeriodDays = graceMinutes / 1440;
		this.updatedAt = utcNow();
	}

	/**
	 * Đặt chu kỳ check-in theo phút (1 đến 47.184.480) và đưa về MONITORING: xóa lastCheckInAt, triggeredAt, graceDeadline và đặt nextCheckAt mới.
	 * Cột số ngày chỉ có giá trị khi số phút chia hết cho 1440.
	 *
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

	/**
	 * Ghi nhận chủ Vault check-in: đặt lastCheckInAt và dời nextCheckAt thêm đúng một chu kỳ.
	 */
	public void checkIn(LocalDateTime now) {
		this.lastCheckInAt = now;
		this.nextCheckAt = now.plusMinutes(getCheckIntervalMinutes());
		this.updatedAt = now;
	}

	/**
	 * Quay lại MONITORING (khi hủy cảnh báo, hoặc check-in trong Grace Period): coi như vừa check-in và xóa mốc triggeredAt/graceDeadline.
	 */
	public void restoreAfterAlert(LocalDateTime now) {
		this.status = "MONITORING";
		this.lastCheckInAt = now;
		this.nextCheckAt = now.plusMinutes(getCheckIntervalMinutes());
		this.triggeredAt = null;
		this.graceDeadline = null;
		this.updatedAt = now;
	}

	// Grace Period tối đa 30 ngày.
	public static final int MAX_GRACE_MINUTES = 30 * 1440;
	public static final String STATUS_MONITORING = "MONITORING";
	public static final String STATUS_TRIGGERED = "TRIGGERED";
	public static final String STATUS_GRACE_PERIOD_EXCEEDED = "GRACE_PERIOD_EXCEEDED";

	/**
	 * Grace Period đã hết khi đang TRIGGERED, có graceDeadline và graceDeadline không nằm sau {@code now}.
	 */
	public boolean isGracePeriodExpired(LocalDateTime now) {
		return STATUS_TRIGGERED.equals(status)
				&& graceDeadline != null
				&& !graceDeadline.isAfter(now);
	}

	/**
	 * TRIGGERED sang GRACE_PERIOD_EXCEEDED (ST-08). Chỉ xác nhận Grace Period đã hết, không xác nhận tử vong.
	 *
	 * @throws IllegalStateException nếu Grace Period chưa hết
	 */
	public void markGracePeriodExceeded(LocalDateTime now) {
		if (!isGracePeriodExpired(now)) {
			throw new IllegalStateException("Grace Period has not expired");
		}

		this.status = STATUS_GRACE_PERIOD_EXCEEDED;
		this.updatedAt = now;
	}

	public Long getId() { return id; }
	public Long getOwnerUserId() { return ownerUserId; }
	public Integer getCheckIntervalDays() { return checkIntervalDays; }
	public int getCheckIntervalMinutes() { return checkIntervalMinutes != null ? checkIntervalMinutes : Math.multiplyExact(checkIntervalDays, 1440); }
	public int getGracePeriodDays() { return gracePeriodDays; }
	/** Cột NULL = dòng cũ, đúng bằng gracePeriodDays * 1440. */
	public int getGracePeriodMinutes() { return gracePeriodMinutes != null ? gracePeriodMinutes : Math.multiplyExact(gracePeriodDays, 1440); }
	public String getStatus() { return status; }
	public LocalDateTime getLastCheckInAt() { return lastCheckInAt; }
	public LocalDateTime getNextCheckAt() { return nextCheckAt; }
	public LocalDateTime getTriggeredAt() { return triggeredAt; }
	public LocalDateTime getGraceDeadline() { return graceDeadline; }
	public LocalDateTime getUpdatedAt() { return updatedAt; }
}
