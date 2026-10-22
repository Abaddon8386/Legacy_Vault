package com.legacyvault.beneficiary;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.auth.EmailNormalizer;
import com.legacyvault.common.crypto.EncryptedData;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.verification.service.LegalWorkflowGuard;
import com.legacyvault.verification.service.HandoverScopeResolver;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InvitationMailDeliveryService {
    private final JdbcTemplate jdbc;
    private final EncryptionService encryption;
    private final ObjectMapper json;
    private final InvitationTokens tokens;
    private final InvitationMailConfiguration config;
    private final LegalWorkflowGuard legal;
    private final HandoverScopeResolver scope;
    private final LegalBasisDossierVersionRepository versions;
    public InvitationMailDeliveryService(JdbcTemplate jdbc,EncryptionService encryption,ObjectMapper json,InvitationTokens tokens,
            InvitationMailConfiguration config,LegalWorkflowGuard legal,HandoverScopeResolver scope,LegalBasisDossierVersionRepository versions) {
        this.jdbc=jdbc;this.encryption=encryption;this.json=json;this.tokens=tokens;this.config=config;
        this.legal=legal;this.scope=scope;this.versions=versions;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Long claim() {
        if(!config.ready()) return null;
        var ids=jdbc.query("""
                ;WITH job AS (SELECT TOP (1) * FROM dbo.beneficiary_invitation_mail_outbox
                    WITH (UPDLOCK,READPAST,READCOMMITTEDLOCK) WHERE transport_status='QUEUED' ORDER BY outbox_id)
                UPDATE job SET transport_status='CLAIMED',processed_at=SYSUTCDATETIME() OUTPUT inserted.outbox_id
                """,(rs,n)->rs.getLong(1));
        return ids.isEmpty()?null:ids.getFirst();
    }
    @Transactional
    public Delivery prepare(Long id) {
        var rows=jdbc.query("""
                SELECT o.public_id,o.invitation_id,o.payload_ciphertext,o.payload_iv,o.key_version,
                    o.invitation_public_id,c.public_id AS case_public_id,o.requested_by_user_id,b.public_id AS beneficiary_public_id
                FROM dbo.beneficiary_invitation_mail_outbox o
                LEFT JOIN dbo.verification_cases c ON c.verification_case_id=o.verification_case_id
                JOIN dbo.beneficiaries b ON b.beneficiary_id=o.beneficiary_id
                WHERE o.outbox_id=? AND o.transport_status='CLAIMED'
                """,(rs,n)->new Pending(UUID.fromString(rs.getString("public_id")),rs.getLong("invitation_id"),
                        rs.getBytes("payload_ciphertext"),rs.getBytes("payload_iv"),rs.getString("key_version"),
                        rs.getString("invitation_public_id"),rs.getString("case_public_id"),rs.getObject("requested_by_user_id",Long.class),
                        UUID.fromString(rs.getString("beneficiary_public_id"))),id);
        if(rows.isEmpty()) return null;
        var row=rows.getFirst();
        if(row.caseId()==null || row.staffId()==null) {finish(id,"SKIPPED");return null;}
        var locked=legal.requireProtectedTransition(UUID.fromString(row.caseId()),LegalWorkflowGuard.ProtectedTransition.HANDOVER);
        scope.resolve(locked.dossier().getLegalBasisDossierId(),versions.findMaxVersionNo(locked.dossier().getLegalBasisDossierId()),row.beneficiaryId());
        var addresses=jdbc.query("""
                SELECT i.recipient_email,i.code_hash
                FROM dbo.beneficiary_invitations i
                JOIN dbo.beneficiaries b ON b.beneficiary_id=i.beneficiary_id
                JOIN dbo.verification_cases c ON c.vault_id=b.vault_id AND c.public_id=?
                JOIN dbo.users u ON u.user_id=c.assigned_staff_user_id
                WHERE i.invitation_id=? AND i.is_current=1 AND i.revoked_at IS NULL AND i.consumed_at IS NULL
                    AND i.expires_at>SYSUTCDATETIME() AND b.linked_user_id IS NULL AND b.id_verification_status='VERIFIED_AT_COUNTER'
                    AND c.status='OPEN' AND u.user_id=? AND u.status='ACTIVE' AND u.deleted_at IS NULL
                    AND EXISTS(SELECT 1 FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id=ur.role_id
                        WHERE ur.user_id=u.user_id AND r.role_code='ROLE_STAFF_EXECUTOR')
                    AND i.recipient_email=(SELECT TOP(1) a.confirmed_email FROM dbo.beneficiary_counter_attestations a
                        WHERE a.verification_case_id=c.verification_case_id AND a.beneficiary_id=b.beneficiary_id ORDER BY a.attestation_id DESC)
                """,(rs,n)->new Address(rs.getString(1),rs.getString(2)),row.caseId(),row.invitationId(),row.staffId());
        if(addresses.isEmpty()) {finish(id,"SKIPPED");return null;}
        try {
            var payload=json.readTree(encryption.decrypt(new EncryptedData(row.ciphertext(),row.iv(),row.keyVersion()),UUID.fromString(row.invitationPublicId()).toString().getBytes(StandardCharsets.UTF_8)));
            String email=payload.path("recipientEmail").asText(),code=payload.path("invitationCode").asText();
            var address=addresses.getFirst();
            if(!tokens.validFormat(code) || !tokens.hash(code).equals(address.hash())
                    || !EmailNormalizer.normalize(email).equals(EmailNormalizer.normalize(address.email()))
                    || !config.permits(email)) {finish(id,"SKIPPED");return null;}
            int changed=jdbc.update("UPDATE dbo.beneficiary_invitation_mail_outbox SET transport_status='SENDING',processed_at=SYSUTCDATETIME() WHERE outbox_id=? AND transport_status='CLAIMED'",id);
            return changed==1?new Delivery(row.id(),email,code):null;
        } catch(Exception unavailable) {throw new IllegalStateException("Invitation payload unavailable");}
    }
    @Transactional
    public void finish(Long id,String state) {
        if(!java.util.Set.of("ACCEPTED","FAILED","UNKNOWN","SKIPPED").contains(state)) throw new IllegalArgumentException("Invalid delivery state");
        jdbc.update("""
                UPDATE dbo.beneficiary_invitation_mail_outbox SET transport_status=?,processed_at=SYSUTCDATETIME(),
                    payload_ciphertext=0x,payload_iv=CONVERT(varbinary(12),0x000000000000000000000000)
                WHERE outbox_id=? AND transport_status IN ('CLAIMED','SENDING')
                """,state,id);
    }
    @Transactional
    public void cleanup() {
        // Never reclaim an ambiguous job: a crash after provider acceptance must not cause another send.
        jdbc.update("""
                UPDATE dbo.beneficiary_invitation_mail_outbox SET transport_status='UNKNOWN',processed_at=SYSUTCDATETIME(),payload_ciphertext=0x,
                    payload_iv=CONVERT(varbinary(12),0x000000000000000000000000)
                WHERE transport_status IN ('CLAIMED','SENDING') AND processed_at<DATEADD(minute,-30,SYSUTCDATETIME())
                """);
        jdbc.update("""
                UPDATE o SET transport_status='SKIPPED',processed_at=SYSUTCDATETIME(),payload_ciphertext=0x,
                    payload_iv=CONVERT(varbinary(12),0x000000000000000000000000)
                FROM dbo.beneficiary_invitation_mail_outbox o JOIN dbo.beneficiary_invitations i ON i.invitation_id=o.invitation_id
                WHERE o.transport_status='QUEUED' AND (i.expires_at<=SYSUTCDATETIME() OR i.revoked_at IS NOT NULL OR i.consumed_at IS NOT NULL OR i.is_current=0)
                """);
    }
    public record Delivery(UUID outboxId,String recipientEmail,String invitationCode) {
        @Override public String toString(){return "InvitationDelivery[redacted]";}
    }
    private record Pending(UUID id,Long invitationId,byte[] ciphertext,byte[] iv,String keyVersion,String invitationPublicId,String caseId,Long staffId,UUID beneficiaryId) {
        @Override public String toString(){return "PendingInvitation[redacted]";}
    }
    private record Address(String email,String hash) { @Override public String toString(){return "InvitationAddress[redacted]";} }
}
