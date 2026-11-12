package com.legacyvault.beneficiary;

import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.auth.EmailNormalizer;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.StaffCaseLockRepository;

/**
 * BE-01: Staff creates an account at the counter for a person, under a case they own. The account is NOT linked to any
 * recipient and gets only the personal Owner role; the person later submits a link request and Staff confirms it.
 * An email that already has an account is rejected, never reused or linked. The password is chosen by the person,
 * stored only as a hash and never logged or audited.
 *
 * <p>Gọi từ {@code StaffLinkRequestController.createAccount}. Bảng {@code users}, {@code user_roles}. Audit
 * {@code BENEFICIARY_ACCOUNT_CREATED_UNLINKED}.
 */
@Service
public class StaffAccountProvisioningService {

	private final StaffContextService staff;
	private final StaffCaseLockRepository caseLookup;
	private final UserRepository users;
	private final PasswordEncoder passwordEncoder;
	private final AuditService audit;
	private final RoleRepository roles;
	private final UserRoleRepository userRoles;

	/**
	 * Hàm khởi tạo, Spring tiêm các phụ thuộc.
	 */
	public StaffAccountProvisioningService(StaffContextService staff, StaffCaseLockRepository caseLookup,
			UserRepository users, PasswordEncoder passwordEncoder, AuditService audit,
			RoleRepository roles, UserRoleRepository userRoles) {
		this.staff = staff;
		this.caseLookup = caseLookup;
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.audit = audit;
		this.roles = roles;
		this.userRoles = userRoles;
	}

	/**
	 * Tạo tài khoản chưa liên kết. Các bước: xác thực Staff, tìm case đang mở thuộc Staff, kiểm tra email chưa tồn tại,
	 * tạo {@code User} ACTIVE với mật khẩu băm, lưu (bắt trùng email), cấp {@code ROLE_VAULT_OWNER}, audit.
	 * Endpoint: {@code POST /api/v1/staff/verification-cases/{caseId}/accounts}.
	 * @return {@code CreatedAccount} với {@code linkStatus = UNLINKED}
	 * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND}, {@code EMAIL_ALREADY_EXISTS}
	 */
	@Transactional
	public BeneficiaryLinkRequestDtos.CreatedAccount createUnlinked(UUID caseId,
			BeneficiaryLinkRequestDtos.CreateAccountRequest request) {
		User actor = staff.requireStaff();
		VerificationCase target = caseLookup.findOwnedByStaff(caseId, actor.getUserId())
				.filter(VerificationCase::isOpen)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		String email = EmailNormalizer.normalize(request.email());
		if (users.existsByEmail(email)) {
			throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
		}
		User account = new User();
		account.setFullName(request.fullName().trim());
		account.setEmail(email);
		account.setPhoneNumber(request.phone() == null || request.phone().isBlank() ? null : request.phone().trim());
		account.setPasswordHash(passwordEncoder.encode(request.password()));
		account.setStatus("ACTIVE");
		try {
			account = users.saveAndFlush(account);
		}
		catch (DataIntegrityViolationException duplicate) {
			throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
		}
		var ownerRole = roles.findByRoleCode("ROLE_VAULT_OWNER")
				.orElseThrow(() -> new IllegalStateException("Required role not found: ROLE_VAULT_OWNER"));
		var personalRole = new UserRole(account, ownerRole);
		personalRole.setAssignedByUserId(actor.getUserId());
		userRoles.save(personalRole);
		audit.record(actor.getUserId(), target.getVaultId(), "BENEFICIARY_ACCOUNT_CREATED_UNLINKED", "USER",
				account.getUserId(), "USER", Map.of("accountPublicId", account.getPublicId().toString(),
						"stateAfter", "UNLINKED"));
		return new BeneficiaryLinkRequestDtos.CreatedAccount(account.getPublicId(), "UNLINKED");
	}
}
