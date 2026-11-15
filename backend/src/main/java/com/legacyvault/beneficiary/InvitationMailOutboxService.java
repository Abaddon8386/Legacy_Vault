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

/** Mã hóa người nhận + mã dùng một lần với AAD gắn theo lời mời, và lưu trong cùng transaction. */
@Service
public class InvitationMailOutboxService {
    private final BeneficiaryInvitationOutboxRepository outbox;
    private final EncryptionService encryption;
    private final ObjectMapper json;

    public InvitationMailOutboxService(BeneficiaryInvitationOutboxRepository outbox,
            EncryptionService encryption, ObjectMapper json) {
        this.outbox = outbox;
        this.encryption = encryption;
        this.json = json;
    }

    /**
     * Mã hóa payload (email + mã mời) rồi ghi vào outbox trong cùng transaction (MANDATORY) với việc phát hành mã.
     * AAD là publicId của lời mời nên ciphertext chỉ giải mã đúng khi gắn với lời mời đó.
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

    /** Tìm outbox đã tạo cho (beneficiary, requestGeneration) để xử lý request lặp một cách idempotent. */
    public Optional<BeneficiaryInvitationOutbox> findByRequest(Long beneficiaryId, int requestGeneration) {
        return outbox.findByBeneficiaryIdAndRequestGeneration(beneficiaryId, requestGeneration);
    }

    private record MailPayload(String recipientEmail, String invitationCode) {
        @Override public String toString() { return "MailPayload[recipientEmail=<redacted>, invitationCode=<redacted>]"; }
    }
}
