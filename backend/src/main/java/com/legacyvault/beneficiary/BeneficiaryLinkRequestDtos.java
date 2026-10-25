package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** BE-01: link requests (recipient side) and counter confirmation (Staff side). */
public final class BeneficiaryLinkRequestDtos {

	private BeneficiaryLinkRequestDtos() { }

	/** The recipient only types the case code (for example HS-2026-000123). */
	public record SubmitRequest(
			@NotBlank(message = "validation.NotBlank")
			@Size(max = 30, message = "validation.Size") String caseCode) { }

	/** What the requester sees about their own request. Deliberately carries no case, vault or recipient data. */
	public record MyRequest(UUID requestId, String status, Instant createdAt, Instant expiresAt) {
		static MyRequest from(BeneficiaryLinkRequest request, java.time.LocalDateTime now) {
			return new MyRequest(request.getPublicId(), request.effectiveStatus(now),
					request.getCreatedAt().toInstant(ZoneOffset.UTC), request.getExpiresAt().toInstant(ZoneOffset.UTC));
		}
	}

	/** Staff view of a pending request: enough to compare the person at the counter with the account. */
	public record StaffRequest(UUID requestId, String status, String requesterName, String requesterEmail,
			Instant createdAt, Instant expiresAt) { }

	/** Staff picks the recipient. The target account is never part of the body; it comes from the stored request. */
	public record ApproveRequest(@NotNull(message = "validation.NotNull") UUID beneficiaryId) { }

	public record Decision(UUID requestId, String status, UUID beneficiaryId, UUID accountId) { }

	/** Create an account at the counter without linking it. The person chooses their own password. */
	public record CreateAccountRequest(
			@NotBlank(message = "validation.NotBlank")
			@jakarta.validation.constraints.Email(message = "validation.Email")
			@Size(max = 254, message = "validation.Size") String email,
			@NotBlank(message = "validation.NotBlank")
			@Size(max = 150, message = "validation.Size") String fullName,
			@NotBlank(message = "validation.NotBlank")
			@Size(min = 8, max = 72, message = "validation.Size") String password,
			@Pattern(regexp = "^$|^\\+?[0-9]{8,15}$", message = "validation.Pattern") String phone) {
		/** Keep the secret out of any accidental toString/log output. */
		@Override
		public String toString() {
			return "CreateAccountRequest[email=" + email + ", password=<redacted>]";
		}
	}

	public record CreatedAccount(UUID accountId, String linkStatus) { }
}
