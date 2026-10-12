package com.legacyvault.user;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users", schema = "dbo")
public class UserAccount {

	@Id
	@Column(name = "user_id")
	private Long id;

	@Column(name = "public_id", nullable = false)
	private UUID publicId;

	@Column(name = "deleted_at")
	private LocalDateTime deletedAt;

	protected UserAccount() {
	}

	public Long getId() {
		return id;
	}

	public UUID getPublicId() {
		return publicId;
	}
}
