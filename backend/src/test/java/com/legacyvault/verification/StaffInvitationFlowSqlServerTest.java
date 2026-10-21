package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.beneficiary.BeneficiaryInvitationService;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.beneficiary.InvitationDtos;
import com.legacyvault.beneficiary.InvitationTokens;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** SQL Server regression coverage for PS-106-bound invitation redemption after Legal unlock. */
@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class StaffInvitationFlowSqlServerTest extends LegalBasisSqlServerSupport {
    private record Fixture(long ownerId, long vaultId, UUID beneficiaryPublicId) { }

    private Fixture ready() {
        UUID ownerPublicId = UUID.randomUUID();
        long ownerId = jdbc.queryForObject(
                "INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES (?,'Owner fixture',?,'unused','ACTIVE')",
                Long.class, ownerPublicId.toString(), ownerPublicId + "@example.test");
        long vaultId = jdbc.queryForObject(
                "INSERT dbo.vaults(owner_user_id,vault_name,status) OUTPUT inserted.vault_id VALUES (?,'Staff invitation fixture','ACTIVE')",
                Long.class, ownerId);
        UUID beneficiaryPublicId = UUID.randomUUID();
        jdbc.update("INSERT dbo.beneficiaries(public_id,vault_id,full_name,id_verification_status) VALUES (?,?,'Recipient fixture','VERIFIED_AT_COUNTER')",
                beneficiaryPublicId.toString(), vaultId);
        return new Fixture(ownerId, vaultId, beneficiaryPublicId);
    }

    private User recipient(String email) {
        UUID publicId = UUID.randomUUID();
        long id = jdbc.queryForObject(
                "INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES (?,'Recipient account',?,'unused','ACTIVE')",
                Long.class, publicId.toString(), email);
        return tx.execute(status -> context.getBean(UserRepository.class).findById(id).orElseThrow());
    }

    private InvitationDtos.Issued issueBound(Fixture fixture) {
        return tx.execute(status -> {
            Beneficiary beneficiary = context.getBean(BeneficiaryRepository.class)
                    .findByPublicIdAndVault_VaultId(fixture.beneficiaryPublicId(), fixture.vaultId())
                    .orElseThrow();
            return context.getBean(BeneficiaryInvitationService.class)
                    .issueBoundForStaff(beneficiary, "recipient@example.test", fixture.ownerId(), 0);
        });
    }

    private InvitationDtos.Linked redeem(String code, User recipient) {
        return tx.execute(status -> context.getBean(BeneficiaryInvitationService.class)
                .redeemBoundAccount(code, recipient.getUserId()));
    }

    @Test
    void staffBoundInvitationRedeemsAfterLegalUnlock() {
        assertRedeemsIn("UNLOCKED");
    }

    @Test
    void staffBoundInvitationRedeemsDuringHandover() {
        assertRedeemsIn("HANDOVER_IN_PROGRESS");
    }

    private void assertRedeemsIn(String vaultStatus) {
        Fixture fixture = ready();
        InvitationDtos.Issued issued = issueBound(fixture);
        User recipient = recipient("recipient@example.test");
        jdbc.update("UPDATE dbo.vaults SET status=? WHERE vault_id=?", vaultStatus, fixture.vaultId());

        InvitationDtos.Linked linked = redeem(issued.code(), recipient);

        assertEquals(fixture.beneficiaryPublicId(), linked.beneficiaryId());
        assertEquals(1, count("beneficiaries", "public_id=? AND linked_user_id=?", fixture.beneficiaryPublicId().toString(), recipient.getUserId()));
        assertEquals(1, count("beneficiary_invitations", "beneficiary_id=(SELECT beneficiary_id FROM dbo.beneficiaries WHERE public_id=?) AND consumed_by_user_id=?",
                fixture.beneficiaryPublicId().toString(), recipient.getUserId()));
    }

    @Test
    void archivedAndPreUnlockBlockedVaultStatesRejectStaffBoundInvitation() {
        for (String vaultStatus : new String[] { "ARCHIVED", "ON_HOLD", "AWAITING_VERIFICATION", "WILL_VERIFICATION", "LEGAL_BASIS_VERIFICATION" }) {
            Fixture fixture = ready();
            InvitationDtos.Issued issued = issueBound(fixture);
            User recipient = recipient("recipient@example.test");
            jdbc.update("UPDATE dbo.vaults SET status=? WHERE vault_id=?", vaultStatus, fixture.vaultId());

            BusinessException error = assertThrows(BusinessException.class, () -> redeem(issued.code(), recipient), vaultStatus);

            assertEquals(ErrorCode.BENEFICIARY_INVITATION_INVALID, error.getErrorCode(), vaultStatus);
            assertEquals(0, count("beneficiaries", "public_id=? AND linked_user_id IS NOT NULL", fixture.beneficiaryPublicId().toString()));
            assertEquals(0, count("beneficiary_invitations", "beneficiary_id=(SELECT beneficiary_id FROM dbo.beneficiaries WHERE public_id=?) AND consumed_at IS NOT NULL",
                    fixture.beneficiaryPublicId().toString()));
        }
    }

    @Test
    void legacyUnboundInvitationRemainsActiveOnly() {
        Fixture fixture = ready();
        var tokens = context.getBean(InvitationTokens.class);
        var beneficiaryId = jdbc.queryForObject("SELECT beneficiary_id FROM dbo.beneficiaries WHERE public_id=?", Long.class,
                fixture.beneficiaryPublicId().toString());
        String code = tokens.generate();
        jdbc.update("INSERT dbo.beneficiary_invitations(public_id,beneficiary_id,generation,is_current,code_hash,issued_at,expires_at,issued_by_user_id) VALUES (?,?,1,1,?,SYSUTCDATETIME(),DATEADD(day,7,SYSUTCDATETIME()),?)",
                UUID.randomUUID().toString(), beneficiaryId, tokens.hash(code), fixture.ownerId());
        User recipient = recipient("recipient@example.test");
        jdbc.update("UPDATE dbo.vaults SET status='UNLOCKED' WHERE vault_id=?", fixture.vaultId());

        assertThrows(BusinessException.class, () -> tx.execute(status -> context.getBean(BeneficiaryInvitationService.class)
                .linkAccount(code, recipient.getUserId())));
        assertEquals(0, count("beneficiaries", "public_id=? AND linked_user_id IS NOT NULL", fixture.beneficiaryPublicId().toString()));
    }
}
