package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.user.entity.User;
import com.legacyvault.auth.EmailNormalizer;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

/**
 * Nhóm DTO của API Staff ghi nhận đã kiểm tra giấy tờ trực tiếp tại quầy ({@code CounterIdentityAttestationController}).
 */
public final class CounterIdentityAttestationDtos {
    /**
     * Lớp tiện ích, không cho khởi tạo.
     */
    private CounterIdentityAttestationDtos() { }

    /**
     * PS-140: {@code evidenceReference} là tùy chọn; thiếu, rỗng hoặc chỉ có khoảng trắng nghĩa là "không có tham chiếu" và được lưu NULL;
     * nếu client vẫn gửi thì giữ lại (đã cắt khoảng trắng, tối đa 200 ký tự).
     *
     * Body của {@code POST .../identity-attestations}: {@code evidenceReference} (tùy chọn, tối đa 200) và {@code confirmedEmail}
     * (tùy chọn, email Staff xác nhận để gửi mã mời).
     */
    public record Request(@Size(max = 200) String evidenceReference,
            @Email @Size(max = 254) String confirmedEmail) {
        /**
         * @return mã tham chiếu đã cắt khoảng trắng, hoặc null nếu trống.
         */
        public String normalizedEvidenceReference() {
            if (evidenceReference == null) return null;
            String trimmed = evidenceReference.trim();
            return trimmed.isEmpty() ? null : trimmed;
        }

        /**
         * @return email đã chuẩn hóa bằng {@code EmailNormalizer}.
         */
        public String normalizedConfirmedEmail() {
            return EmailNormalizer.normalize(confirmedEmail);
        }
    }

    /**
     * Kết quả chứng thực: {@code attestationId}, {@code caseId}, {@code beneficiaryId}, {@code recordedBy} (mã công khai của Staff) và {@code recordedAt} (UTC).
     */
    public record Response(UUID attestationId, UUID caseId, UUID beneficiaryId, UUID recordedBy,
            Instant recordedAt) {
        /**
         * Dựng {@code Response} từ bản ghi chứng thực và Staff thực hiện.
         */
        static Response from(BeneficiaryCounterAttestation attestation, User actor) {
            return new Response(attestation.getPublicId(), attestation.getVerificationCase().getPublicId(),
                    attestation.getBeneficiary().getPublicId(), actor.getPublicId(),
                    attestation.getAttestedAt().toInstant(ZoneOffset.UTC));
        }
    }
}
