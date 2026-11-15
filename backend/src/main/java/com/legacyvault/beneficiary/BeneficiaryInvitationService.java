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

/** PS-86. Các thao tác ghi tài nguyên tuần tự hóa trên Vault trước khi refresh Beneficiary và lời mời.
 * Liên kết tài khoản khóa User đích trước, khớp thứ tự User -> Vault của các writer nội dung Owner.
 * PS-87 phải gọi linkAccount trong transaction xác thực bên ngoài, sau rate limiting và xác thực.
 * PS-86 không cung cấp endpoint đổi mã công khai. */
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

    /** Xem trạng thái lời mời hiện tại của một người thụ hưởng (chỉ Owner của vault). Không có lời mời thì trả {@code NOT_ISSUED}. */
    @Transactional(readOnly = true)
    public InvitationDtos.Metadata get(UUID vaultId, UUID beneficiaryId) {
        User owner = owners.requireOwner();
        Vault vault = ownerVaults.requireOwnedVault(vaultId, owner.getUserId());
        Beneficiary beneficiary = findBeneficiary(vault, beneficiaryId);
        return InvitationDtos.Metadata.from(current(beneficiary), beneficiaryId, now());
    }

    /**
     * Owner phát hành lời mời đầu tiên (generation 1). Lỗi nếu người thụ hưởng đã liên kết tài khoản
     * hoặc đã có lời mời current. Mã thô chỉ được trả về một lần trong kết quả.
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
     * Owner phát hành lại: thu hồi và retire bản current cũ rồi tạo generation + 1.
     * @param generation generation client đang thấy; lệch với DB thì báo STALE (chống thao tác trên dữ liệu cũ).
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
        // Bắt buộc flush trước khi INSERT: chỉ mục unique có lọc cho bản current sẽ vi phạm nếu hai bản cùng current.
        invitations.saveAndFlush(old);
        return create(beneficiary, Math.addExact(generation, 1), owner.getUserId(), "BENEFICIARY_INVITATION_REISSUED");
    }

    /** PS-106 internal seam: xoay mã PS-86 current chưa gắn (hoặc tạo thế hệ đầu tiên), gắn
     * mã mới với địa chỉ do Staff xác nhận. Caller chịu trách nhiệm các guard Staff/case/Legal/allocation và outbox txn. */
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
            // Mã đã gắn email do Staff xác nhận thì không được xoay lại, tránh ghi đè địa chỉ đã xác nhận (expectedGeneration phải khớp generation hiện tại, 0 = chưa có lời mời).
            if (old.getRecipientEmail() != null) throw error(ErrorCode.BENEFICIARY_INVITATION_ALREADY_EXISTS);
            if (old.getRevokedAt() == null) old.revoke(staffUserId, now());
            old.retire();
            invitations.saveAndFlush(old);
        }
        String action = old == null ? "BENEFICIARY_INVITATION_ISSUED" : "BENEFICIARY_INVITATION_REISSUED";
        return create(beneficiary, Math.addExact(currentGeneration, 1), staffUserId, action, normalizedEmail);
    }

    /** Owner thu hồi lời mời current. Idempotent nếu đã thu hồi; lỗi nếu đã được sử dụng. */
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

    /** Caller đã giữ khóa Vault có thể chỉnh sửa. Đổi thông tin liên hệ không được để mã dùng chung cũ vẫn dùng được. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void revokeForEmailChange(Beneficiary beneficiary, Long actor) {
        BeneficiaryInvitation invitation = current(beneficiary);
        if (invitation == null || invitation.getConsumedAt() != null || invitation.getRevokedAt() != null) return;
        invitation.revoke(actor, now());
        invitations.save(invitation);
        record(actor, invitation, "BENEFICIARY_INVITATION_REVOKED");
    }

    /** PS-88: Staff đã liên kết tài khoản tại quầy, nên mã dùng chung còn pending không được tiếp tục dùng được. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void revokeForCounterLink(Beneficiary beneficiary, Long actor) {
        revokeForEmailChange(beneficiary, actor);
    }

    /** PS-86 internal seam được giữ lại cho các luồng Staff đã có. */
    @Transactional(propagation = Propagation.MANDATORY)
    public InvitationDtos.Linked linkAccount(String code, Long accountId) {
        return linkAccountInternal(code, accountId, false);
    }

    /** PS-87 redeem có xác thực. Lời mời PS-106 gắn với Staff có thể được redeem khi
     * email tài khoản đã xác thực khớp chính xác với ràng buộc do quầy xác nhận. Lời mời cũ chưa gắn
     * giữ yêu cầu email tài khoản đã xác minh hiện có và fail closed. */
    @Transactional(propagation = Propagation.MANDATORY)
    public InvitationDtos.Linked redeemBoundAccount(String code, Long accountId) {
        return linkAccountInternal(code, accountId, true);
    }

    /**
     * Luồng liên kết tài khoản với lời mời, dùng chung cho {@link #linkAccount} và {@link #redeemBoundAccount}.
     * Mọi lỗi 'không dùng được' đều trả cùng mã INVALID để không lộ thông tin (chống dò mã).
     * @param requireEmailBinding true: yêu cầu email tài khoản khớp email đã ràng buộc và danh tính đã xác minh tại quầy.
     * @return kết quả liên kết; idempotent nếu chính tài khoản này đã dùng mã này trước đó.
     */
    private InvitationDtos.Linked linkAccountInternal(String code, Long accountId, boolean requireEmailBinding) {
        if (!tokens.validFormat(code) || accountId == null) throw invalid();
        // Chỉ tra cứu theo hash của mã; mã thô không bao giờ được lưu.
        BeneficiaryInvitation invitation = invitations.findByCodeHash(tokens.hash(code)).orElseThrow(this::invalid);
        Long vaultId = invitation.getBeneficiary().getVault().getVaultId();
        // Không bao giờ chờ User khi đang giữ Vault: các writer Owner/quota đã dùng thứ tự User -> Vault.
        User account = users.findActiveAccountForUpdate(accountId).orElseThrow(this::invalid);
        entities.refresh(account);
        // Khóa vault sau khi đã khóa User (thứ tự User -> Vault); refresh để đọc trạng thái mới nhất.
        Vault vault = vaults.findByIdForUpdate(vaultId).orElseThrow(this::invalid);
        entities.refresh(vault);
        // Lời mời Staff gắn email vẫn redeem được sau khi Legal mở khóa, kể cả trong lúc
        // bàn giao. Lời mời cũ/Owner giữ hành vi gốc, chỉ áp dụng cho ACTIVE.
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
        // Tài khoản nội bộ (Admin/Staff/Legal) không được làm người thụ hưởng.
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
        // Cấp role BENEFICIARY ngay trong cùng transaction với việc liên kết và đánh dấu mã đã dùng, nên lỗi ở bước nào cũng rollback toàn bộ.
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
    /** Khóa vault ở chế độ ghi (phải ở trạng thái cho phép chỉnh sửa) rồi tải lại người thụ hưởng; kiểm tra thuộc đúng vault để tránh truy cập chéo. */
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
    /** Lấy lời mời current và refresh để tránh dùng bản cache cũ trong persistence context. */
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
        return create(beneficiary, generation, actor, action, null);
    }
    /** Sinh mã mới, lưu hash (saveAndFlush), ghi audit và trả mã thô một lần duy nhất cho người gọi. */
    private InvitationDtos.Issued create(Beneficiary beneficiary, int generation, Long actor, String action,
            String recipientEmail) {
        String code = tokens.generate();
        BeneficiaryInvitation invitation = invitations.saveAndFlush(
                new BeneficiaryInvitation(beneficiary, generation, tokens.hash(code), actor, now(), recipientEmail));
        record(actor, invitation, action);
        return new InvitationDtos.Issued(InvitationDtos.Metadata.from(invitation, beneficiary.getPublicId(), now()), code);
    }
    private void record(Long actor, BeneficiaryInvitation invitation, String action) {
        Beneficiary beneficiary = invitation.getBeneficiary();
        audit.record(actor, beneficiary.getVault().getVaultId(), action, "BENEFICIARY_INVITATION", invitation.getId(), "USER",
                Map.of("beneficiaryId", beneficiary.getPublicId().toString(), "generation", invitation.getGeneration(),
                        "stateAfter", invitation.state(now())));
    }
    // datetime2 của SQL Server giữ 100 ns; đồng hồ Linux trả về nanosecond, nên giá trị trả về ngay sau
    // issue() sẽ khác giá trị đọc lại. Microsecond phù hợp mọi nền tảng và cột này.
    private LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS); }
    private BusinessException invalid() { return error(ErrorCode.BENEFICIARY_INVITATION_INVALID); }
    private BusinessException error(ErrorCode code) { return new BusinessException(code); }
}
