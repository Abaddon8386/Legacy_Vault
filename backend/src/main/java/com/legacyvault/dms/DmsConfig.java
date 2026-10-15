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

@Entity
@Table(name = "dms_configs", schema = "dbo")
public class DmsConfig {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "dms_id")
	private Long id;

	@Column(name = "owner_user_id", nullable = false)
	private Long ownerUserId;

	@Column(name = "check_interval_days", nullable = false)
	private int checkIntervalDays;

	@Column(name = "grace_period_days", nullable = false)
	private int gracePeriodDays;

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
		this.gracePeriodDays = gracePeriodDays;
		this.status = "MONITORING";
		this.nextCheckAt = nextCheckAt;
		this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	@PrePersist
	void onCreate() {
		if (status == null) status = "MONITORING";
		if (updatedAt == null) updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	@PreUpdate
	void onUpdate() {
		updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public void configure(int checkIntervalDays, LocalDateTime nextCheckAt) {
		this.checkIntervalDays = checkIntervalDays;
		this.status = "MONITORING";
		this.lastCheckInAt = null;
		this.nextCheckAt = nextCheckAt;
		this.triggeredAt = null;
		this.graceDeadline = null;
		this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public void checkIn(LocalDateTime now) {
		this.lastCheckInAt = now;
		this.nextCheckAt = now.plusDays(checkIntervalDays);
		this.updatedAt = now;
	}

	public void restoreAfterAlert(LocalDateTime now) {
		this.status = "MONITORING";
		this.lastCheckInAt = now;
		this.nextCheckAt = now.plusDays(this.checkIntervalDays);
		this.triggeredAt = null;
		this.graceDeadline = null;
		this.updatedAt = now;
	}

	public static final String STATUS_MONITORING = "MONITORING";
	public static final String STATUS_TRIGGERED = "TRIGGERED";
	public static final String STATUS_GRACE_PERIOD_EXCEEDED = "GRACE_PERIOD_EXCEEDED";

	public boolean isGracePeriodExpired(LocalDateTime now) {
		return STATUS_TRIGGERED.equals(status)
				&& graceDeadline != null
				&& !graceDeadline.isAfter(now);
	}

	public void markGracePeriodExceeded(LocalDateTime now) {
		if (!isGracePeriodExpired(now)) {
			throw new IllegalStateException("Grace Period has not expired");
		}

		this.status = STATUS_GRACE_PERIOD_EXCEEDED;
		this.updatedAt = now;
	}

	public Long getId() { return id; }
	public Long getOwnerUserId() { return ownerUserId; }
	public int getCheckIntervalDays() { return checkIntervalDays; }
	public int getGracePeriodDays() { return gracePeriodDays; }
	public String getStatus() { return status; }
	public LocalDateTime getLastCheckInAt() { return lastCheckInAt; }
	public LocalDateTime getNextCheckAt() { return nextCheckAt; }
	public LocalDateTime getTriggeredAt() { return triggeredAt; }
	public LocalDateTime getGraceDeadline() { return graceDeadline; }
	public LocalDateTime getUpdatedAt() { return updatedAt; }
}
