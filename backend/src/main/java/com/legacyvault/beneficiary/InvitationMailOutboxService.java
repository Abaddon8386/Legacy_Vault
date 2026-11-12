package com.legacyvault.beneficiary;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.common.crypto.EncryptedData;
import com.legacyvault.common.crypto.EncryptionService;

/**
 * <p>Dịch vụ nội bộ của {@code StaffInvitationEmailService}: tuần tự hóa payload JSON (email và mã mời thô), mã hóa AES-GCM bằng
 * {@code EncryptionService} với AAD là mã công khai lời mời và ghi vào bảng {@code beneficiary_invitation_mail_outbox}.
 */
@Service
public class InvitationMailOutboxService {
    private final BeneficiaryInvitationOutboxRepository outbox;
    private final EncryptionService encryption;
    private final ObjectMapper json;

    /**
     * Hàm khởi tạo, Spring tiêm repository outbox, dịch vụ mã hóa và {@code ObjectMapper}.
     */
    public InvitationMailOutboxService(BeneficiaryInvitationOutboxRepository outbox,
            EncryptionService encryption, ObjectMapper json) {
        this.outbox = outbox;
        this.encryption = encryption;
        this.json = json;
    }

    /**
     * Xếp một email mời vào outbox. Bắt buộc chạy trong giao dịch có sẵn (MANDATORY) để mã mời và outbox cùng commit/rollback.
     * @param invitation lời mời đã lưu
     * @param beneficiaryId id nội bộ người thụ hưởng
     * @param requestGeneration thế hệ kỳ vọng Staff gửi lên (dùng chống trùng)
     * @param recipientEmail email người nhận
     * @param rawCode mã mời thô
     * @return dòng outbox đã lưu
     * @throws IllegalStateException nếu không tuần tự hóa được payload
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public BeneficiaryInvitationOutbox enqueue(BeneficiaryInvitation invitation, Long beneficiaryId,
            int requestGeneration, String recipientEmail, String rawCode) {
        String payload;
        try {
            payload = json.writeValueAsString(new MailPayload(recipientEmail, rawCode));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialize invitation mail payload", ex);
        }
        byte[] aad = invitation.getPublicId().toString().getBytes(StandardCharsets.UTF_8);
        EncryptedData encrypted = encryption.encrypt(payload, aad);
        return outbox.saveAndFlush(new BeneficiaryInvitationOutbox(UUID.randomUUID(), beneficiaryId,
                invitation.getId(), invitation.getPublicId(), requestGeneration, invitation.getGeneration(), encrypted.ciphertext(),
                encrypted.iv(), encrypted.keyVersion()));
    }

    /**
     * Tìm dòng outbox đã tạo cho cùng người thụ hưởng và thế hệ kỳ vọng, để xử lý yêu cầu lặp một cách idempotent.
     */
    public Optional<BeneficiaryInvitationOutbox> findByRequest(Long beneficiaryId, int requestGeneration) {
        return outbox.findByBeneficiaryIdAndRequestGeneration(beneficiaryId, requestGeneration);
    }

    /**
     * Payload JSON được mã hóa; {@code toString} che cả hai trường.
     */
    private record MailPayload(String recipientEmail, String invitationCode) {
        @Override public String toString() { return "MailPayload[recipientEmail=<redacted>, invitationCode=<redacted>]"; }
    }
}
