package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.legacyvault.user.UserAccount;

public final class IdentityVerificationDtos {

	private IdentityVerificationDtos() { }

	public enum DocumentType { CCCD, PASSPORT }
	public enum Result { MATCH, NOT_MATCH }

	public record Request(@NotNull(message = "validation.NotNull") DocumentType documentType,
			@Size(max = 150, message = "validation.Size") String issuingAuthority,
			@Pattern(regexp = "^[0-9A-Za-z]{4}$", message = "validation.Pattern") String documentSuffix,
			@NotNull(message = "validation.NotNull") Result result) { }

	public record Verifier(UUID id, String fullName) { }

	public record Response(UUID id, UUID beneficiaryId, DocumentType documentType, String issuingAuthority,
			String documentSuffix, Result result, Verifier verifiedBy, String verifiedAt) {
		static Response from(IdentityVerificationRecord record, UserAccount actor) {
			return new Response(record.getPublicId(), record.getBeneficiary().getPublicId(),
					DocumentType.valueOf(record.getDocumentType()), record.getIssuingAuthority(), record.getDocumentSuffix(),
					Result.valueOf(record.getResult()), new Verifier(actor.getPublicId(), actor.getFullName()),
					utc(record.getVerifiedAt()));
		}
		private static String utc(LocalDateTime value) {
			return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
		}
	}
}
