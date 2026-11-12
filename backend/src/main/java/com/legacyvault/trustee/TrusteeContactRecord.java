package com.legacyvault.trustee;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Entity ánh xạ bảng {@code dbo.trustee_contact_records}: mỗi lần Staff liên hệ Trustee (kênh, kết quả, trạng thái dự phòng). Tạo bởi {@code TrusteeContactService.record}.
 */
@Entity
@Table(name = "trustee_contact_records", schema = "dbo")
public class TrusteeContactRecord {

	/**
	 * Khóa chính nội bộ ({@code contact_record_id}).
	 */
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "contact_record_id")
	private Long id;

	/**
	 * Id công khai, sinh trong {@link #onCreate()}.
	 */
	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	/**
	 * Trustee được liên hệ (nạp lười).
	 */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "trustee_id", nullable = false)
	private Trustee trustee;

	/**
	 * Id Staff thực hiện liên hệ.
	 */
	@Column(name = "actor_user_id", nullable = false)
	private Long actorUserId;

	/**
	 * Kênh liên hệ (tên enum Channel).
	 */
	@Column(name = "channel", nullable = false, length = 20)
	private String channel;

	/**
	 * Kết quả liên hệ (tên enum Outcome).
	 */
	@Column(name = "outcome", nullable = false, length = 20)
	private String outcome;

	/**
	 * Trạng thái dự phòng (tên enum FallbackStatus).
	 */
	@Column(name = "fallback_status", nullable = false, length = 20)
	private String fallbackStatus;

	/**
	 * Ghi chú tùy chọn.
	 */
	@Column(name = "note", length = 500)
	private String note;

	/**
	 * Thời điểm ghi (UTC).
	 */
	@Column(name = "occurred_at", nullable = false)
	private LocalDateTime occurredAt;

	/**
	 * Constructor không tham số cho JPA.
	 */
	protected TrusteeContactRecord() { }

	/**
	 * Tạo bản ghi liên hệ.
	 *
	 * @param trustee Trustee được liên hệ
	 * @param actorUserId id Staff
	 * @param channel kênh
	 * @param outcome kết quả
	 * @param fallbackStatus trạng thái dự phòng
	 * @param note ghi chú
	 */
	public TrusteeContactRecord(Trustee trustee, Long actorUserId, String channel, String outcome,
			String fallbackStatus, String note) {
		this.trustee = trustee;
		this.actorUserId = actorUserId;
		this.channel = channel;
		this.outcome = outcome;
		this.fallbackStatus = fallbackStatus;
		this.note = note;
	}

	/**
	 * Callback JPA: sinh {@code publicId} và đặt {@code occurredAt} nếu chưa có.
	 */
	@PrePersist
	void onCreate() {
		if (publicId == null) publicId = UUID.randomUUID();
		if (occurredAt == null) occurredAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	/**
	 * @return khóa chính nội bộ
	 */
	public Long getId() { return id; }
	/**
	 * @return id công khai
	 */
	public UUID getPublicId() { return publicId; }
	/**
	 * @return Trustee được liên hệ
	 */
	public Trustee getTrustee() { return trustee; }
	/**
	 * @return id Staff thực hiện
	 */
	public Long getActorUserId() { return actorUserId; }
	/**
	 * @return kênh liên hệ
	 */
	public String getChannel() { return channel; }
	/**
	 * @return kết quả
	 */
	public String getOutcome() { return outcome; }
	/**
	 * @return trạng thái dự phòng
	 */
	public String getFallbackStatus() { return fallbackStatus; }
	/**
	 * @return ghi chú
	 */
	public String getNote() { return note; }
	/**
	 * @return thời điểm ghi (UTC)
	 */
	public LocalDateTime getOccurredAt() { return occurredAt; }
}
