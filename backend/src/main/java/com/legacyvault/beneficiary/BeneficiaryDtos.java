package com.legacyvault.beneficiary;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

public final class BeneficiaryDtos {
	private BeneficiaryDtos() { }

	public record UpsertRequest(
			@NotBlank(message = "validation.NotBlank") @Size(max = 150, message = "validation.Size") String fullName,
			@Size(max = 100, message = "validation.Size") String relationship,
			@PastOrPresent(message = "validation.PastOrPresent") LocalDate dateOfBirth,
			@Size(max = 20, message = "validation.Size") String phone,
			@Email(message = "validation.Email") @Size(max = 254, message = "validation.Size") String email,
			@Size(max = 100, message = "validation.Size") String identityNumber) {
	}

	public record Response(UUID id, UUID vaultId, String fullName, String relationship, LocalDate dateOfBirth,
			String phone, String email, boolean hasIdentityNumber, boolean hasAccount, String status,
			String createdAt, String updatedAt) {
		public static Response from(Beneficiary beneficiary) {
			return new Response(beneficiary.getPublicId(), beneficiary.getVault().getPublicId(), beneficiary.getFullName(),
					beneficiary.getRelationship(), beneficiary.getDateOfBirth(), beneficiary.getPhone(), beneficiary.getEmail(),
					beneficiary.hasIdentityNumber(), beneficiary.hasAccount(), beneficiary.getStatus(),
					utc(beneficiary.getCreatedAt()), utc(beneficiary.getUpdatedAt()));
		}
	}

	public record ConfigurationIssue(String code, String messageKey, String message) { }
	public record ConfigurationCheck(UUID vaultId, boolean ready, long beneficiaryCount, List<ConfigurationIssue> issues) {
		public ConfigurationCheck {
			issues = List.copyOf(issues);
		}
	}

	private static String utc(LocalDateTime value) {
		return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
	}
}
