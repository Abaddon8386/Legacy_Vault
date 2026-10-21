package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.legacyvault.user.entity.User;

public final class CounterIdentityAttestationDtos {
	private CounterIdentityAttestationDtos() { }

	public record Request(@NotBlank(message = "validation.NotBlank")
			@Size(max = 200, message = "validation.Size") String evidenceReference) { }

	public record Response(UUID attestationId, UUID caseId, UUID beneficiaryId, UUID recordedBy, String recordedAt) {
		static Response from(BeneficiaryCounterAttestation attestation, User staff) {
			return new Response(attestation.getPublicId(), attestation.getVerificationCase().getPublicId(),
					attestation.getBeneficiary().getPublicId(), staff.getPublicId(),
					attestation.getAttestedAt().toInstant(ZoneOffset.UTC).toString());
		}
	}
}
