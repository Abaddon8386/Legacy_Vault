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

@Entity
@Table(name = "trustee_contact_records", schema = "dbo")
public class TrusteeContactRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "contact_record_id")
	private Long id;

	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "trustee_id", nullable = false)
	private Trustee trustee;

	@Column(name = "actor_user_id", nullable = false)
	private Long actorUserId;

	@Column(name = "channel", nullable = false, length = 20)
	private String channel;

	@Column(name = "outcome", nullable = false, length = 20)
	private String outcome;

	@Column(name = "fallback_status", nullable = false, length = 20)
	private String fallbackStatus;

	@Column(name = "note", length = 500)
	private String note;

	@Column(name = "occurred_at", nullable = false)
	private LocalDateTime occurredAt;

	protected TrusteeContactRecord() { }

	public TrusteeContactRecord(Trustee trustee, Long actorUserId, String channel, String outcome,
			String fallbackStatus, String note) {
		this.trustee = trustee;
		this.actorUserId = actorUserId;
		this.channel = channel;
		this.outcome = outcome;
		this.fallbackStatus = fallbackStatus;
		this.note = note;
	}

	@PrePersist
	void onCreate() {
		if (publicId == null) publicId = UUID.randomUUID();
		if (occurredAt == null) occurredAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public Long getId() { return id; }
	public UUID getPublicId() { return publicId; }
	public Trustee getTrustee() { return trustee; }
	public Long getActorUserId() { return actorUserId; }
	public String getChannel() { return channel; }
	public String getOutcome() { return outcome; }
	public String getFallbackStatus() { return fallbackStatus; }
	public String getNote() { return note; }
	public LocalDateTime getOccurredAt() { return occurredAt; }
}
