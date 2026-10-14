package com.legacyvault.trustee;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class TrusteeDtos {
	private TrusteeDtos() { }

	public record CreateRequest(
			@NotNull(message = "validation.NotNull") UUID vaultId,
			@NotBlank(message = "validation.NotBlank") @Size(max = 150, message = "validation.Size") String fullName,
			@Size(max = 20, message = "validation.Size") String phone,
			@Email(message = "validation.Email") @Size(max = 254, message = "validation.Size") String email,
			@Size(max = 100, message = "validation.Size") String relationship,
			@Size(max = 500, message = "validation.Size") String note) {
		@AssertTrue(message = "validation.contactRequired")
		public boolean isContactProvided() {
			return (phone != null && !phone.isBlank()) || (email != null && !email.isBlank());
		}
	}

	public record UpdateRequest(
			@NotBlank(message = "validation.NotBlank") @Size(max = 150, message = "validation.Size") String fullName,
			@Size(max = 20, message = "validation.Size") String phone,
			@Email(message = "validation.Email") @Size(max = 254, message = "validation.Size") String email,
			@Size(max = 100, message = "validation.Size") String relationship,
			@Size(max = 500, message = "validation.Size") String note) {
		@AssertTrue(message = "validation.contactRequired")
		public boolean isContactProvided() {
			return (phone != null && !phone.isBlank()) || (email != null && !email.isBlank());
		}
	}

	public record Response(UUID id, UUID vaultId, String fullName, String phone, String email,
			String relationship, String note, String status, String appointedAt, String revokedAt, String updatedAt) {
		public static Response from(Trustee trustee) {
			return new Response(trustee.getPublicId(), trustee.getVault().getPublicId(), trustee.getFullName(),
					trustee.getPhone(), trustee.getEmail(), trustee.getRelationship(), trustee.getNote(), trustee.getStatus(),
					utc(trustee.getAppointedAt()), utc(trustee.getRevokedAt()), utc(trustee.getUpdatedAt()));
		}
	}

	private static String utc(LocalDateTime value) {
		return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
	}
}
