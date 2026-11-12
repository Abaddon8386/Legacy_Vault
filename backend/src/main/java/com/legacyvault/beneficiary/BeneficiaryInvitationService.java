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
import com.legacyvault.auth.EmailNormalizer;
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
 * No public redemption endpoint is supplied by PS-86.
 *
 * <p>Vai trò: vòng đời mã mời liên kết tài khoản cho người thụ hưởng. Owner cấp, xem, cấp lại, thu hồi mã (qua
 * {@code BeneficiaryInvitationController}); Staff cấp mã gắn email (qua {@code StaffInvitationEmailService.issueBoundForStaff});
 * người thụ hưởng đã đăng nhập đổi mã lấy liên kết (qua {@code InvitationRedeemService}, endpoint {@code POST /api/v1/auth/invitations/redeem}).
 * <p>Bảng liên quan: {@code beneficiary_invitations}, {@code beneficiaries}, {@code users}, {@code user_roles}, {@code vaults}.
 * Audit (qua {@code AuditService}): {@code BENEFICIARY_INVITATION_ISSUED}, {@code _REISSUED}, {@code _REVOKED}, {@code _CONSUMED}.
 * Thứ tự khóa: User rồi Vault, tránh deadlock với các luồng ghi của Owner.
 */
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

    /**
     * Hàm khởi tạo, Spring tiêm repository, dịch vụ Vault/Owner, bộ sinh mã {@code InvitationTokens}, {@code EntityManager} và audit.
     */
    public BeneficiaryInvitationService(BeneficiaryInvitationRepository invitations, BeneficiaryRepository beneficiaries,
            OwnerContextService owners, VaultService ownerVaults, VaultRepository vaults, UserRepository users,
            UserRoleRepository userRoles, RoleRepository roles, InvitationTokens tokens, EntityManager entities, AuditService audit) {
        this.invitations = invitations; this.beneficiaries = beneficiaries; this.owners = owners;
        this.ownerVaults = ownerVaults; this.vaults = vaults; this.users = users; this.userRoles = userRoles;
        this.roles = roles; this.tokens = tokens; this.entities = entities; this.audit = audit;
    }

    /**
     * Xem metadata mã mời hiện hành của một người thụ hưởng (không bao giờ trả mã thô).
     * Endpoint: {@code GET /api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}/invitation} (VAULT_OWNER).
     * @return {@code Metadata}; trạng thái {@code NOT_ISSUED} nếu chưa cấp
     * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND} nếu Vault/người thụ hưởng không thuộc Owner
     */
    @Transactional(readOnly = true)
    public InvitationDtos.Metadata get(UUID vaultId, UUID beneficiaryId) {
        User owner = owners.requireOwner();
        Vault vault = ownerVaults.requireOwnedVault(vaultId, owner.getUserId());
        Beneficiary beneficiary = findBeneficiary(vault, beneficiaryId);
        return InvitationDtos.Metadata.from(current(beneficiary), beneficiaryId, now());
    }

    /**
     * Cấp mã mời đầu tiên (generation 1). Khóa Vault để ghi, đảm bảo người thụ hưởng chưa liên kết và chưa có mã hiện hành.
     * Endpoint: {@code POST .../invitation}. Audit {@code BENEFICIARY_INVITATION_ISSUED}.
     * @return {@code Issued} chứa metadata và mã thô (chỉ trả một lần)
     * @throws com.legacyvault.common.error.BusinessException {@code BENEFICIARY_ACCOUNT_ALREADY_LINKED}, {@code BENEFICIARY_INVITATION_ALREADY_EXISTS}
     */
    @Transactional
    public InvitationDtos.Issued issue(UUID vaultId, UUID beneficiaryId) {
        User owner = owners.requireOwner();
        Beneficiary beneficiary = ownerWrite(vaultId, beneficiaryId, owner);
        requireUnlinked(beneficiary);
        if (current(beneficiary) != null) throw error(ErrorCode.BENEFICIARY_INVITATION_ALREADY_EXISTS);
        return create(beneficiary, 1, owner.getUserId(), "BENEFICIARY_INVITATION_ISSUED");
    }

    /**
     * Cấp lại mã: thu hồi mã hiện hành, bỏ cờ hiện hành, flush để giải phóng ô duy nhất rồi tạo mã generation+1.
     * Endpoint: {@code POST .../invitation/reissue}. Audit {@code BENEFICIARY_INVITATION_REISSUED}.
     * @param generation thế hệ client đang thấy; lệch với DB thì từ chối để chống thao tác cũ
     * @throws com.legacyvault.common.error.BusinessException {@code BENEFICIARY_INVITATION_ALREADY_USED}, {@code BENEFICIARY_INVITATION_STALE}, {@code RESOURCE_NOT_FOUND}
     */
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

    /** PS-106 internal seam: rotate an unbound/current PS-86 code (or create the first generation), binding the
     * new code to the Staff-confirmed address. Caller owns the Staff/case/Legal/allocation guards and outbox txn.
     *
     * Cấp mã mời gắn với email Staff đã xác nhận tại quầy (PS-106). Phải chạy trong giao dịch có sẵn (MANDATORY). Chấp nhận
     * generation kỳ vọng 0 (chưa có mã) hoặc đúng thế hệ hiện hành chưa gắn email; mã cũ được thu hồi và thay thế.
     * @param expectedGeneration thế hệ Staff nhìn thấy
     * @throws com.legacyvault.common.error.BusinessException {@code BENEFICIARY_INVITATION_COUNTER_EMAIL_REQUIRED}, {@code BENEFICIARY_INVITATION_STALE}, {@code BENEFICIARY_INVITATION_ALREADY_USED}, {@code BENEFICIARY_INVITATION_ALREADY_EXISTS}
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public InvitationDtos.Issued issueBoundForStaff(Beneficiary beneficiary, String confirmedEmail,
            Long staffUserId, int expectedGeneration) {
        requireUnlinked(beneficiary);
        String normalizedEmail = EmailNormalizer.normalize(confirmedEmail);
        if (normalizedEmail == null || normalizedEmail.isBlank()) {
            throw error(ErrorCode.BENEFICIARY_INVITATION_COUNTER_EMAIL_REQUIRED);
        }
        BeneficiaryInvitation old = current(beneficiary);
        int currentGeneration = old == null ? 0 : old.getGeneration();
        if (expectedGeneration != currentGeneration) throw error(ErrorCode.BENEFICIARY_INVITATION_STALE);
        if (old != null) {
            if (old.getConsumedAt() != null) throw error(ErrorCode.BENEFICIARY_INVITATION_ALREADY_USED);
            if (old.getRecipientEmail() != null) throw error(ErrorCode.BENEFICIARY_INVITATION_ALREADY_EXISTS);
            if (old.getRevokedAt() == null) old.revoke(staffUserId, now());
            old.retire();
            invitations.saveAndFlush(old);
        }
        String action = old == null ? "BENEFICIARY_INVITATION_ISSUED" : "BENEFICIARY_INVITATION_REISSUED";
        return create(beneficiary, Math.addExact(currentGeneration, 1), staffUserId, action, normalizedEmail);
    }

    /**
     * Thu hồi mã hiện hành (idempotent nếu đã thu hồi). Endpoint: {@code DELETE .../invitation?generation=n}. Audit {@code BENEFICIARY_INVITATION_REVOKED}.
     * @throws com.legacyvault.common.error.BusinessException {@code BENEFICIARY_INVITATION_STALE}, {@code BENEFICIARY_INVITATION_ALREADY_USED}, {@code RESOURCE_NOT_FOUND}
     */
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

    /**
     * Caller already holds the editable Vault lock. A contact change cannot leave an old shared code usable.
     *
     * Thu hồi mã hiện hành còn hiệu lực (nếu có). Gọi từ {@code BeneficiaryService.update} khi Owner đổi email người thụ hưởng.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void revokeForEmailChange(Beneficiary beneficiary, Long actor) {
        BeneficiaryInvitation invitation = current(beneficiary);
        if (invitation == null || invitation.getConsumedAt() != null || invitation.getRevokedAt() != null) return;
        invitation.revoke(actor, now());
        invitations.save(invitation);
        record(actor, invitation, "BENEFICIARY_INVITATION_REVOKED");
    }

    /**
     * PS-88: Staff linked an account at the counter, so a still-pending shared code must not stay usable.
     *
     * Thu hồi mã đang chờ khi Staff đã liên kết tài khoản tại quầy; gọi từ {@code BeneficiaryAccountService.attach}.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void revokeForCounterLink(Beneficiary beneficiary, Long actor) {
        revokeForEmailChange(beneficiary, actor);
    }

    /**
     * PS-86 internal seam retained for established Staff flows.
     *
     * Đổi mã lấy liên kết tài khoản, không yêu cầu ràng buộc email (đường nội bộ cũ).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public InvitationDtos.Linked linkAccount(String code, Long accountId) {
        return linkAccountInternal(code, accountId, false);
    }

    /** Authenticated PS-87 redeem. A Staff-bound PS-106 invitation may be redeemed when the
     * authenticated account email exactly matches the counter-confirmed binding. Legacy unbound
     * invitations retain the existing verified-account-email requirement and fail closed.
     *
     * Đổi mã lấy liên kết tài khoản ở chế độ có kiểm tra ràng buộc email; được gọi từ {@code InvitationRedeemService.redeem}.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public InvitationDtos.Linked redeemBoundAccount(String code, Long accountId) {
        return linkAccountInternal(code, accountId, true);
    }

    /**
     * Lõi của việc đổi mã. Các bước: kiểm tra định dạng mã, tìm lời mời theo hash, khóa tài khoản rồi Vault, kiểm tra trạng thái Vault
     * và email ràng buộc, xác minh danh tính tại quầy, loại tài khoản nội bộ/chủ kho, xử lý lặp (idempotent nếu cùng tài khoản đã dùng),
     * cấp {@code ROLE_BENEFICIARY}, liên kết người thụ hưởng, đánh dấu mã đã dùng và audit {@code BENEFICIARY_INVITATION_CONSUMED}.
     * @param requireEmailBinding {@code true} cho PS-87 (kiểm tra email); {@code false} cho đường nội bộ
     * @return {@code Linked} gồm mã người thụ hưởng, mã tài khoản, trạng thái tài khoản
     * @throws com.legacyvault.common.error.BusinessException {@code BENEFICIARY_INVITATION_INVALID} cho mọi mã không dùng được (không lộ lý do),
     * {@code BENEFICIARY_INVITATION_EMAIL_VERIFICATION_REQUIRED}, {@code BENEFICIARY_IDENTITY_NOT_VERIFIED}
     */
    private InvitationDtos.Linked linkAccountInternal(String code, Long accountId, boolean requireEmailBinding) {
        if (!tokens.validFormat(code) || accountId == null) throw invalid();
        BeneficiaryInvitation invitation = invitations.findByCodeHash(tokens.hash(code)).orElseThrow(this::invalid);
        Long vaultId = invitation.getBeneficiary().getVault().getVaultId();
        // Never wait for a User while holding a Vault: Owner/quota writers already use User -> Vault.
        User account = users.findActiveAccountForUpdate(accountId).orElseThrow(this::invalid);
        entities.refresh(account);
        Vault vault = vaults.findByIdForUpdate(vaultId).orElseThrow(this::invalid);
        entities.refresh(vault);
        // Email-bound Staff invitations remain redeemable after Legal unlock, including during
        // handover. Legacy/Owner invitations retain the original ACTIVE-only behavior.
        boolean redeemableVaultStatus = requireEmailBinding
                ? Vault.STATUS_ACTIVE.equals(vault.getStatus()) || Vault.STATUS_UNLOCKED.equals(vault.getStatus())
                        || Vault.STATUS_HANDOVER_IN_PROGRESS.equals(vault.getStatus())
                : Vault.STATUS_ACTIVE.equals(vault.getStatus());
        if (!redeemableVaultStatus || accountId.equals(vault.getOwnerUserId())) throw invalid();
        Beneficiary beneficiary = invitation.getBeneficiary();
        entities.refresh(beneficiary);
        entities.refresh(invitation);
        if (requireEmailBinding) {
            String recipientEmail = EmailNormalizer.normalize(invitation.getRecipientEmail());
            if ((recipientEmail == null || recipientEmail.isBlank()) && account.getEmailVerifiedAt() == null) {
                throw error(ErrorCode.BENEFICIARY_INVITATION_EMAIL_VERIFICATION_REQUIRED);
            }
            if (recipientEmail == null || !recipientEmail.equals(EmailNormalizer.normalize(account.getEmail()))) {
                throw invalid();
            }
        }
        if (requireEmailBinding && !Beneficiary.VERIFIED_AT_COUNTER.equals(beneficiary.getIdentityVerificationStatus())) {
            throw error(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED);
        }
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

    /**
     * Dựng kết quả {@code Linked} từ người thụ hưởng và tài khoản.
     */
    private InvitationDtos.Linked linked(Beneficiary beneficiary, User account) {
        return new InvitationDtos.Linked(beneficiary.getPublicId(), account.getPublicId(), beneficiary.getAccountStatus());
    }
    /**
     * Chuẩn bị ghi của Owner: khóa Vault có thể sửa, tìm người thụ hưởng, refresh để tránh dữ liệu cũ và kiểm tra thuộc đúng Vault.
     */
    private Beneficiary ownerWrite(UUID vaultId, UUID beneficiaryId, User owner) {
        Vault vault = ownerVaults.requireEditableVaultForUpdate(vaultId, owner.getUserId());
        Beneficiary beneficiary = findBeneficiary(vault, beneficiaryId);
        entities.refresh(beneficiary);
        if (!vault.getVaultId().equals(beneficiary.getVault().getVaultId())) throw error(ErrorCode.RESOURCE_NOT_FOUND);
        return beneficiary;
    }
    /**
     * Tìm người thụ hưởng theo mã công khai trong một Vault; không thấy thì {@code RESOURCE_NOT_FOUND}.
     */
    private Beneficiary findBeneficiary(Vault vault, UUID beneficiaryId) {
        return beneficiaries.findByPublicIdAndVault_VaultId(beneficiaryId, vault.getVaultId())
                .orElseThrow(() -> error(ErrorCode.RESOURCE_NOT_FOUND));
    }
    /**
     * Lấy mã hiện hành (đã refresh từ DB) hoặc null.
     */
    private BeneficiaryInvitation current(Beneficiary beneficiary) {
        BeneficiaryInvitation invitation = invitations.findByBeneficiary_IdAndCurrentTrue(beneficiary.getId()).orElse(null);
        if (invitation != null) entities.refresh(invitation);
        return invitation;
    }
    /**
     * Như {@code current} nhưng ném {@code RESOURCE_NOT_FOUND} nếu không có.
     */
    private BeneficiaryInvitation requireCurrent(Beneficiary beneficiary) {
        BeneficiaryInvitation invitation = current(beneficiary);
        if (invitation == null) throw error(ErrorCode.RESOURCE_NOT_FOUND);
        return invitation;
    }
    /**
     * Từ chối nếu người thụ hưởng đã có tài khoản ({@code BENEFICIARY_ACCOUNT_ALREADY_LINKED}).
     */
    private void requireUnlinked(Beneficiary beneficiary) {
        if (beneficiary.hasAccount()) throw error(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED);
    }
    /**
     * Tạo mã không ràng buộc email.
     */
    private InvitationDtos.Issued create(Beneficiary beneficiary, int generation, Long actor, String action) {
        return create(beneficiary, generation, actor, action, null);
    }
    /**
     * Sinh mã ngẫu nhiên, lưu hash cùng thế hệ (và email nếu có), ghi audit và trả mã thô một lần duy nhất.
     */
    private InvitationDtos.Issued create(Beneficiary beneficiary, int generation, Long actor, String action,
            String recipientEmail) {
        String code = tokens.generate();
        BeneficiaryInvitation invitation = invitations.saveAndFlush(
                new BeneficiaryInvitation(beneficiary, generation, tokens.hash(code), actor, now(), recipientEmail));
        record(actor, invitation, action);
        return new InvitationDtos.Issued(InvitationDtos.Metadata.from(invitation, beneficiary.getPublicId(), now()), code);
    }
    /**
     * Ghi audit cho lời mời (loại đối tượng {@code BENEFICIARY_INVITATION}, chi tiết gồm mã người thụ hưởng, thế hệ và trạng thái sau).
     */
    private void record(Long actor, BeneficiaryInvitation invitation, String action) {
        Beneficiary beneficiary = invitation.getBeneficiary();
        audit.record(actor, beneficiary.getVault().getVaultId(), action, "BENEFICIARY_INVITATION", invitation.getId(), "USER",
                Map.of("beneficiaryId", beneficiary.getPublicId().toString(), "generation", invitation.getGeneration(),
                        "stateAfter", invitation.state(now())));
    }
    // SQL Server datetime2 keeps 100 ns; Linux clocks return nanoseconds, so the value returned right after
    // issue() would differ from the one read back. Micros fit every platform and the column.
    /**
     * Giờ UTC hiện tại, cắt về micro giây để khớp độ chính xác cột datetime2.
     */
    private LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS); }
    /**
     * Lỗi chung {@code BENEFICIARY_INVITATION_INVALID}, dùng cho mọi mã không hợp lệ để không lộ thông tin.
     */
    private BusinessException invalid() { return error(ErrorCode.BENEFICIARY_INVITATION_INVALID); }
    /**
     * Tạo {@code BusinessException} từ {@code ErrorCode}.
     */
    private BusinessException error(ErrorCode code) { return new BusinessException(code); }
}
