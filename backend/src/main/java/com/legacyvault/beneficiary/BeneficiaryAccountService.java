package com.legacyvault.beneficiary;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.auth.EmailNormalizer;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

import jakarta.persistence.EntityManager;

/**
 * PS-62 / PS-63 (ST-24, LV-ID-001): at the counter, after the Beneficiary has passed the in-person check (ST-14), Staff
 * links an existing account or creates a new one for the Beneficiary record. The Beneficiary record stays independent
 * of the account: only linked_user_id and account_status change. No Guest Portal, claim link or OTP.
 * Account/unique-email locks precede Vault -> VerificationCase -> Beneficiary refresh.
 * Preflight is rechecked under resource locks; any failure rolls back a newly created account too.
 */
@Service
public class BeneficiaryAccountService {

	static final String STEP_ID = "ST-24";
	static final String RULE_ID = "LV-ID-001";
	static final String BENEFICIARY_ROLE = "ROLE_BENEFICIARY";
	/** Internal authorities that must never double as a Beneficiary account (separation of duties). */
	private static final Set<String> INTERNAL_ROLES = Set.of("ROLE_STAFF_EXECUTOR", "ROLE_LEGAL_VERIFIER", "ROLE_ADMIN");

	private final BeneficiaryRepository beneficiaries;
	private final StaffContextService staff;
	private final StaffVaultCaseGuard cases;
	private final EntityManager entities;
	private final UserRepository users;
	private final RoleRepository roles;
	private final UserRoleRepository userRoles;
	private final PasswordEncoder passwordEncoder;
	private final AuditService audit;
	private final BeneficiaryInvitationService invitations;

	public BeneficiaryAccountService(BeneficiaryRepository beneficiaries, StaffContextService staff,
			StaffVaultCaseGuard cases, EntityManager entities, UserRepository users, RoleRepository roles,
			UserRoleRepository userRoles, PasswordEncoder passwordEncoder, AuditService audit,
			BeneficiaryInvitationService invitations) {
		this.beneficiaries = beneficiaries;
		this.staff = staff;
		this.cases = cases;
		this.entities = entities;
		this.users = users;
		this.roles = roles;
		this.userRoles = userRoles;
		this.passwordEncoder = passwordEncoder;
		this.audit = audit;
		this.invitations = invitations;
	}

	/** PS-62: link an existing active account. */
	@Transactional
	public BeneficiaryAccountDtos.Response link(UUID beneficiaryId, BeneficiaryAccountDtos.LinkRequest request) {
		User actor = staff.requireStaff();
		// Authorize and reject identity/link problems before looking up an account. This read is
		// only a preflight; all checks run again after the User -> Vault -> Case write locks.
		preflightForAccount(beneficiaryId, actor);
		User account = users.findByEmail(EmailNormalizer.normalize(request.accountEmail()))
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		account = users.findActiveAccountForUpdate(account.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE));
		entities.refresh(account);
		Beneficiary beneficiary = lockForAccount(beneficiaryId, actor);
		requireEligible(beneficiary, account);
		attach(beneficiary, account, actor, AuditAction.BENEFICIARY_ACCOUNT_LINKED);
		return BeneficiaryAccountDtos.Response.from(beneficiary, account.getPublicId());
	}

	/** PS-63: create and activate a new account at the counter, then link it. */
	@Transactional
	public BeneficiaryAccountDtos.Response create(UUID beneficiaryId, BeneficiaryAccountDtos.CreateRequest request) {
		User actor = staff.requireStaff();
		Beneficiary preview = preflightForAccount(beneficiaryId, actor);
		String email = EmailNormalizer.normalize(request.email());
		if (users.existsByEmail(email)) {
			throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
		}
		User account = new User();
		account.setFullName(preview.getFullName());
		account.setEmail(email);
		account.setPhoneNumber(request.phone() == null || request.phone().isBlank() ? null : request.phone().trim());
		account.setPasswordHash(passwordEncoder.encode(request.password()));
		// Identity was verified face to face (ST-14), so the account is active immediately; no email OTP.
		account.setStatus("ACTIVE");
		try {
			account = users.saveAndFlush(account);
		} catch (DataIntegrityViolationException duplicate) {
			throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
		}
		// Signup-by-invitation also inserts User before locking Vault. Waiting on the email
		// unique index while holding Vault would invert that order and can deadlock.
		Beneficiary beneficiary = lockForAccount(beneficiaryId, actor);
		account.setFullName(beneficiary.getFullName());
		attach(beneficiary, account, actor, AuditAction.BENEFICIARY_ACCOUNT_CREATED);
		return BeneficiaryAccountDtos.Response.from(beneficiary, account.getPublicId());
	}

	private Beneficiary preflightForAccount(UUID beneficiaryId, User actor) {
		Beneficiary beneficiary = beneficiaries.findByPublicId(beneficiaryId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		cases.requireOpenForRead(beneficiary.getVault().getVaultId(), actor.getUserId());
		requireUnlinkedVerified(beneficiary);
		return beneficiary;
	}

	private Beneficiary lockForAccount(UUID beneficiaryId, User actor) {
		Beneficiary beneficiary = beneficiaries.findByPublicId(beneficiaryId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		Long vaultId = beneficiary.getVault().getVaultId();
		cases.requireOpenForWrite(vaultId, actor.getUserId());
		// Re-read under the Vault/Case locks: another Staff may have linked this record while we waited.
		entities.refresh(beneficiary);
		if (!vaultId.equals(beneficiary.getVault().getVaultId())) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
		requireUnlinkedVerified(beneficiary);
		return beneficiary;
	}

	private void requireUnlinkedVerified(Beneficiary beneficiary) {
		if (!Beneficiary.VERIFIED_AT_COUNTER.equals(beneficiary.getIdentityVerificationStatus())) {
			throw new BusinessException(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED);
		}
		if (beneficiary.hasAccount()) {
			throw new BusinessException(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED);
		}
	}

	private void requireEligible(Beneficiary beneficiary, User account) {
		Long vaultId = beneficiary.getVault().getVaultId();
		boolean usable = "ACTIVE".equals(account.getStatus()) && account.getDeletedAt() == null;
		boolean ownerOfVault = account.getUserId().equals(beneficiary.getVault().getOwnerUserId());
		boolean internalAuthority = userRoles.findByUserIdWithRole(account.getUserId()).stream()
				.map(UserRole::getRole).map(Role::getRoleCode).anyMatch(INTERNAL_ROLES::contains);
		boolean alreadyBeneficiaryOfVault = beneficiaries
				.existsByVault_VaultIdAndLinkedUserId(vaultId, account.getUserId());
		if (!usable || ownerOfVault || internalAuthority || alreadyBeneficiaryOfVault) {
			throw new BusinessException(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE);
		}
	}

	private void attach(Beneficiary beneficiary, User account, User actor, AuditAction action) {
		boolean hasBeneficiaryRole = userRoles.findByUserIdWithRole(account.getUserId()).stream()
				.map(UserRole::getRole).map(Role::getRoleCode).anyMatch(BENEFICIARY_ROLE::equals);
		if (!hasBeneficiaryRole) {
			Role role = roles.findByRoleCode(BENEFICIARY_ROLE)
					.orElseThrow(() -> new IllegalStateException("Required role not found: " + BENEFICIARY_ROLE));
			userRoles.save(new UserRole(account, role));
		}
		String before = beneficiary.getAccountStatus();
		beneficiary.linkAccount(account.getUserId());
		beneficiaries.save(beneficiary);
		// PS-88: once linked at the counter, a pending invitation code would only be a dead end for the Owner.
		invitations.revokeForCounterLink(beneficiary, actor.getUserId());
		// Audit never records the email, password or any identity data.
		Map<String, Object> details = new LinkedHashMap<>();
		details.put("stepId", STEP_ID);
		details.put("ruleId", RULE_ID);
		details.put("stateBefore", before);
		details.put("stateAfter", beneficiary.getAccountStatus());
		details.put("beneficiaryPublicId", beneficiary.getPublicId().toString());
		details.put("accountPublicId", account.getPublicId().toString());
		audit.record(actor.getUserId(), beneficiary.getVault().getVaultId(), action.name(), "BENEFICIARY",
				beneficiary.getId(), "USER", details);
	}
}
