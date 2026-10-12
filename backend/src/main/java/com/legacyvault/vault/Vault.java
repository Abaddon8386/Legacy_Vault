package com.legacyvault.vault;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "vaults", schema = "dbo")
public class Vault {

	@Id
	@Column(name = "vault_id")
	private Long id;

	@Column(name = "public_id", nullable = false)
	private UUID publicId;

	@Column(name = "owner_user_id", nullable = false)
	private Long ownerUserId;

	@Column(name = "status", nullable = false)
	private String status;

	protected Vault() {
	}

	public Long getId() {
		return id;
	}

	public UUID getPublicId() {
		return publicId;
	}

	public Long getOwnerUserId() {
		return ownerUserId;
	}

	public String getStatus() {
		return status;
	}

	public boolean isEditable() {
		return "ACTIVE".equals(status);
	}
}
