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

/** Encrypts recipient+one-time code with invitation-bound AAD and persists it in the same transaction. */
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

    public Optional<BeneficiaryInvitationOutbox> findByRequest(Long beneficiaryId, int requestGeneration) {
        return outbox.findByBeneficiaryIdAndRequestGeneration(beneficiaryId, requestGeneration);
    }

    private record MailPayload(String recipientEmail, String invitationCode) {
        @Override public String toString() { return "MailPayload[recipientEmail=<redacted>, invitationCode=<redacted>]"; }
    }
}
