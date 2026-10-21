package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.common.crypto.EncryptedData;
import com.legacyvault.common.crypto.EncryptionService;

class InvitationMailOutboxServiceTest {
    private final BeneficiaryInvitationOutboxRepository outbox = mock(BeneficiaryInvitationOutboxRepository.class);
    private final EncryptionService encryption = mock(EncryptionService.class);
    private final ObjectMapper json = new ObjectMapper();
    private final InvitationMailOutboxService service = new InvitationMailOutboxService(outbox, encryption, json);

    @Test
    void encryptsRecipientAndCodeWithInvitationBoundAssociatedDataBeforePersistence() throws Exception {
        var invitation = mock(BeneficiaryInvitation.class);
        UUID invitationPublicId = UUID.randomUUID();
        when(invitation.getPublicId()).thenReturn(invitationPublicId);
        when(invitation.getId()).thenReturn(19L);
        when(invitation.getGeneration()).thenReturn(2);
        when(encryption.encrypt(anyString(), any(byte[].class)))
                .thenReturn(new EncryptedData(new byte[] { 3, 4 }, new byte[12], "test-v1"));
        when(outbox.saveAndFlush(any(BeneficiaryInvitationOutbox.class)))
                .thenAnswer(call -> call.getArgument(0));

        BeneficiaryInvitationOutbox saved = service.enqueue(invitation, 14L, 1,
                "recipient@example.test", "raw-invitation-code");

        ArgumentCaptor<String> plaintext = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<byte[]> aad = ArgumentCaptor.forClass(byte[].class);
        verify(encryption).encrypt(plaintext.capture(), aad.capture());
        assertTrue(plaintext.getValue().contains("recipient@example.test"));
        assertTrue(plaintext.getValue().contains("raw-invitation-code"));
        assertFalse(saved.toString().contains("recipient@example.test"));
        assertFalse(saved.toString().contains("raw-invitation-code"));
        assertTrue(java.util.Arrays.equals(invitationPublicId.toString().getBytes(StandardCharsets.UTF_8), aad.getValue()));
        verify(outbox).saveAndFlush(saved);
    }
}
