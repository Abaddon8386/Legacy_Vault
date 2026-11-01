package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.user.entity.User;
import com.legacyvault.auth.EmailNormalizer;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public final class CounterIdentityAttestationDtos {
    private CounterIdentityAttestationDtos() { }

    /**
     * PS-140: {@code evidenceReference} is optional. Absent, empty and whitespace-only values mean "no reference" and
     * are stored as NULL; a client that still sends a reference keeps it (trimmed, at most 200 characters).
     */
    public record Request(@Size(max = 200) String evidenceReference,
            @Email @Size(max = 254) String confirmedEmail) {
        public String normalizedEvidenceReference() {
            if (evidenceReference == null) return null;
            String trimmed = evidenceReference.trim();
            return trimmed.isEmpty() ? null : trimmed;
        }

        public String normalizedConfirmedEmail() {
            return EmailNormalizer.normalize(confirmedEmail);
        }
    }

    public record Response(UUID attestationId, UUID caseId, UUID beneficiaryId, UUID recordedBy,
            Instant recordedAt) {
        static Response from(BeneficiaryCounterAttestation attestation, User actor) {
            return new Response(attestation.getPublicId(), attestation.getVerificationCase().getPublicId(),
                    attestation.getBeneficiary().getPublicId(), actor.getPublicId(),
                    attestation.getAttestedAt().toInstant(ZoneOffset.UTC));
        }
    }
}
