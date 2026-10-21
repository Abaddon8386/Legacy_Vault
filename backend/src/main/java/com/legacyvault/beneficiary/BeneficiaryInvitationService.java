package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.vault.service.VaultService;

/** PS-86. Resource writes serialize on Vault before refreshing Beneficiary and invitation.
 * Account linking first locks the target User, matching User -> Vault in Owner content writers.
 * PS-87 must call linkAccount in its outer auth transaction, after rate limiting and authentication.
 * No public redemption endpoint is supplied by PS-86. */
@Service
public class BeneficiaryInvitationService {
    private static final Set<String> INTERNAL_ROLES = Set.of("ROLE_ADMIN", "ROLE_STAFF_EXECUTOR", "ROLE_LEGAL_VERIFIER");
    private final BeneficiaryInvitationRepository invitations;
    private final BeneficiaryRepository beneficiaries;
    private final OwnerContextService owners;
    private final VaultService ownerVaults;
    private final VaultRepository vaults;
    private final UserRepository users;
    private final UserRoleRepository userRoles;
    private final RoleRepository roles;
    private final InvitationTokens tokens;
    private final EntityManager entities;
    private final AuditService audit;

    public BeneficiaryInvitationService(BeneficiaryInvitationRepository invitations, BeneficiaryRepository beneficiaries,
            OwnerContextService owners, VaultService ownerVaults, VaultRepository vaults, UserRepository users,
            UserRoleRepository userRoles, RoleRepository roles, InvitationTokens tokens, EntityManager entities, AuditService audit) {
        this.invitations = invitations; this.beneficiaries = beneficiaries; this.owners = owners;
        this.ownerVaults = ownerVaults; this.vaults = vaults; this.users = users; this.userRoles = userRoles;
        this.roles = roles; this.tokens = tokens; this.entities = entities; this.audit = audit;
    }

    @Transactional(readOnly = true)
    public InvitationDtos.Metadata get(UUID vaultId, UUID beneficiaryId) {
        User owner = owners.requireOwner();
        Vault vault = ownerVaults.requireOwnedVault(vaultId, owner.getUserId());
        Beneficiary beneficiary = findBeneficiary(vault, beneficiaryId);
        return InvitationDtos.Metadata.from(current(beneficiary), beneficiaryId, now());
    }

    @Transactional
    public InvitationDtos.Issued issue(UUID vaultId, UUID beneficiaryId) {
        User owner = owners.requireOwner();
        Beneficiary beneficiary = ownerWrite(vaultId, beneficiaryId, owner);
        requireUnlinked(beneficiary);
        if (current(beneficiary) != null) throw error(ErrorCode.BENEFICIARY_INVITATION_ALREADY_EXISTS);
        return create(beneficiary, 1, owner.getUserId(), "BENEFICIARY_INVITATION_ISSUED");
    }

    @Transactional
    public InvitationDtos.Issued reissue(UUID vaultId, UUID beneficiaryId, int generation) {
        User owner = owners.requireOwner();
        Beneficiary beneficiary = ownerWrite(vaultId, beneficiaryId, owner);
        requireUnlinked(beneficiary);
        BeneficiaryInvitation old = requireCurrent(beneficiary);
        if (old.getConsumedAt() != null) throw error(ErrorCode.BENEFICIARY_INVITATION_ALREADY_USED);
        if (old.getGeneration() != generation) throw error(ErrorCode.BENEFICIARY_INVITATION_STALE);
        if (old.getRevokedAt() == null) old.revoke(owner.getUserId(), now());
        old.retire();
        invitations.saveAndFlush(old); // Free the filtered unique current slot before INSERT.
        return create(beneficiary, Math.addExact(generation, 1), owner.getUserId(), "BENEFICIARY_INVITATION_REISSUED");
    }

    @Transactional
    public void revoke(UUID vaultId, UUID beneficiaryId, int generation) {
        User owner = owners.requireOwner();
        Beneficiary beneficiary = ownerWrite(vaultId, beneficiaryId, owner);
        BeneficiaryInvitation invitation = requireCurrent(beneficiary);
        if (invitation.getGeneration() != generation) throw error(ErrorCode.BENEFICIARY_INVITATION_STALE);
        if (invitation.getConsumedAt() != null) throw error(ErrorCode.BENEFICIARY_INVITATION_ALREADY_USED);
        if (invitation.getRevokedAt() != null) return;
        invitation.revoke(owner.getUserId(), now());
        invitations.save(invitation);
        record(owner.getUserId(), invitation, "BENEFICIARY_INVITATION_REVOKED");
    }

    /** Caller already holds the editable Vault lock. A contact change cannot leave an old shared code usable. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void revokeForEmailChange(Beneficiary beneficiary, Long actor) {
        BeneficiaryInvitation invitation = current(beneficiary);
        if (invitation == null || invitation.getConsumedAt() != null || invitation.getRevokedAt() != null) return;
        invitation.revoke(actor, now());
        invitations.save(invitation);
        record(actor, invitation, "BENEFICIARY_INVITATION_REVOKED");
    }

    /** PS-88: Staff linked an account at the counter, so a still-pending shared code must not stay usable. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void revokeForCounterLink(Beneficiary beneficiary, Long actor) {
        revokeForEmailChange(beneficiary, actor);
    }

    /** Internal PS-87 integration seam, NOT an HTTP API. Caller resolves accountId from a verified
     * authenticated principal, or a new account created inside the SAME transaction. Caller must
     * enforce a durable/shared failed-attempt limit before calling; never accept a client accountId.
     * Lock order target User -> Vault. Caller must not already hold a Vault/resource write lock.
     * Code possession is the invitation proof: there is deliberately no email match/verification check. */
    @Transactional(propagation = Propagation.MANDATORY)
    public InvitationDtos.Linked linkAccount(String code, Long accountId) {
        if (!tokens.validFormat(code) || accountId == null) throw invalid();
        BeneficiaryInvitation invitation = invitations.findByCodeHash(tokens.hash(code)).orElseThrow(this::invalid);
        Long vaultId = invitation.getBeneficiary().getVault().getVaultId();
        // Never wait for a User while holding a Vault: Owner/quota writers already use User -> Vault.
        User account = users.findActiveAccountForUpdate(accountId).orElseThrow(this::invalid);
        entities.refresh(account);
        Vault vault = vaults.findByIdForUpdate(vaultId).orElseThrow(this::invalid);
        entities.refresh(vault);
        // Freeze/archive never opens a new self-service path; Staff fallback remains separate.
        if (!"ACTIVE".equals(vault.getStatus()) || accountId.equals(vault.getOwnerUserId())) throw invalid();
        Beneficiary beneficiary = invitation.getBeneficiary();
        entities.refresh(beneficiary);
        entities.refresh(invitation);
        if (!vaultId.equals(beneficiary.getVault().getVaultId())) throw invalid();
        if (!"ACTIVE".equals(account.getStatus()) || account.getDeletedAt() != null) throw invalid();
        var authorities = userRoles.findByUserIdWithRole(accountId).stream()
                .map(UserRole::getRole).map(Role::getRoleCode).toList();
        if (authorities.stream().anyMatch(INTERNAL_ROLES::contains)) throw invalid();
        if (invitation.getConsumedAt() != null) {
            if (invitation.isCurrent() && accountId.equals(invitation.getConsumedBy())
                    && accountId.equals(beneficiary.getLinkedUserId()) && authorities.contains("ROLE_BENEFICIARY")) {
                return linked(beneficiary, account);
            }
            throw invalid();
        }
        LocalDateTime acceptedAt = now();
        if (!invitation.isCurrent() || !"PENDING".equals(invitation.state(acceptedAt)) || beneficiary.hasAccount()
                || beneficiaries.existsByVault_VaultIdAndLinkedUserId(vaultId, accountId)) throw invalid();
        if (!authorities.contains("ROLE_BENEFICIARY")) {
            Role role = roles.findByRoleCode("ROLE_BENEFICIARY")
                    .orElseThrow(() -> new IllegalStateException("Required beneficiary role missing"));
            userRoles.save(new UserRole(account, role));
        }
        beneficiary.linkAccount(accountId);
        beneficiaries.save(beneficiary);
        invitation.consume(accountId, acceptedAt);
        invitations.save(invitation);
        record(accountId, invitation, "BENEFICIARY_INVITATION_CONSUMED");
        return linked(beneficiary, account);
    }

    private InvitationDtos.Linked linked(Beneficiary beneficiary, User account) {
        return new InvitationDtos.Linked(beneficiary.getPublicId(), account.getPublicId(), beneficiary.getAccountStatus());
    }
    private Beneficiary ownerWrite(UUID vaultId, UUID beneficiaryId, User owner) {
        Vault vault = ownerVaults.requireEditableVaultForUpdate(vaultId, owner.getUserId());
        Beneficiary beneficiary = findBeneficiary(vault, beneficiaryId);
        entities.refresh(beneficiary);
        if (!vault.getVaultId().equals(beneficiary.getVault().getVaultId())) throw error(ErrorCode.RESOURCE_NOT_FOUND);
        return beneficiary;
    }
    private Beneficiary findBeneficiary(Vault vault, UUID beneficiaryId) {
        return beneficiaries.findByPublicIdAndVault_VaultId(beneficiaryId, vault.getVaultId())
                .orElseThrow(() -> error(ErrorCode.RESOURCE_NOT_FOUND));
    }
    private BeneficiaryInvitation current(Beneficiary beneficiary) {
        BeneficiaryInvitation invitation = invitations.findByBeneficiary_IdAndCurrentTrue(beneficiary.getId()).orElse(null);
        if (invitation != null) entities.refresh(invitation);
        return invitation;
    }
    private BeneficiaryInvitation requireCurrent(Beneficiary beneficiary) {
        BeneficiaryInvitation invitation = current(beneficiary);
        if (invitation == null) throw error(ErrorCode.RESOURCE_NOT_FOUND);
        return invitation;
    }
    private void requireUnlinked(Beneficiary beneficiary) {
        if (beneficiary.hasAccount()) throw error(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED);
    }
    private InvitationDtos.Issued create(Beneficiary beneficiary, int generation, Long actor, String action) {
        String code = tokens.generate();
        BeneficiaryInvitation invitation = invitations.saveAndFlush(
                new BeneficiaryInvitation(beneficiary, generation, tokens.hash(code), actor, now()));
        record(actor, invitation, action);
        return new InvitationDtos.Issued(InvitationDtos.Metadata.from(invitation, beneficiary.getPublicId(), now()), code);
    }
    private void record(Long actor, BeneficiaryInvitation invitation, String action) {
        Beneficiary beneficiary = invitation.getBeneficiary();
        audit.record(actor, beneficiary.getVault().getVaultId(), action, "BENEFICIARY_INVITATION", invitation.getId(), "USER",
                Map.of("beneficiaryId", beneficiary.getPublicId().toString(), "generation", invitation.getGeneration(),
                        "stateAfter", invitation.state(now())));
    }
    private LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    private BusinessException invalid() { return error(ErrorCode.BENEFICIARY_INVITATION_INVALID); }
    private BusinessException error(ErrorCode code) { return new BusinessException(code); }
}
