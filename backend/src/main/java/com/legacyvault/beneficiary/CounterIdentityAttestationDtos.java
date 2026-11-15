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
     * PS-140: {@code evidenceReference} là tùy chọn. Giá trị vắng mặt, rỗng hoặc chỉ gồm khoảng trắng nghĩa là "không có tham chiếu" và
     * được lưu là NULL; client vẫn gửi tham chiếu thì được giữ lại (đã trim, tối đa 200 ký tự).
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
