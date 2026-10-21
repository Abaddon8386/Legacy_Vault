package com.legacyvault.beneficiary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

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
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

import jakarta.persistence.EntityManager;

/** PS-62 / PS-63 (ST-24, LV-ID-001): counter-assisted account linking and creation for a verified Beneficiary. */
class BeneficiaryAccountServiceTest {

	private static final Long STAFF_ID = 7L;
	private static final Long VAULT_ID = 9L;
	private static final Long OWNER_ID = 3L;
	private static final Long BENEFICIARY_DB_ID = 12L;
	private static final Long ACCOUNT_ID = 21L;
	private static final UUID BENEFICIARY_ID = UUID.randomUUID();
	private static final UUID ACCOUNT_PUBLIC_ID = UUID.randomUUID();

	private final BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
	private final StaffContextService staff = mock(StaffContextService.class);
	private final StaffVaultCaseGuard cases = mock(StaffVaultCaseGuard.class);
	private final EntityManager entities = mock(EntityManager.class);
	private final UserRepository users = mock(UserRepository.class);
	private final RoleRepository roles = mock(RoleRepository.class);
	private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
	private final PasswordEncoder encoder = mock(PasswordEncoder.class);
	private final AuditService audit = mock(AuditService.class);
	private final BeneficiaryInvitationService invitations = mock(BeneficiaryInvitationService.class);
	private final BeneficiaryAccountService service = new BeneficiaryAccountService(beneficiaries, staff, cases,
			entities, users, roles, userRoles, encoder, audit, invitations);

	private final User actor = mock(User.class);
	private final Beneficiary beneficiary = mock(Beneficiary.class);
	private final Vault vault = mock(Vault.class);
	private final Role beneficiaryRole = mock(Role.class);

	BeneficiaryAccountServiceTest() {
		when(actor.getUserId()).thenReturn(STAFF_ID);
		when(staff.requireStaff()).thenReturn(actor);
		when(vault.getVaultId()).thenReturn(VAULT_ID);
		when(vault.getOwnerUserId()).thenReturn(OWNER_ID);
		when(beneficiary.getVault()).thenReturn(vault);
		when(beneficiary.getId()).thenReturn(BENEFICIARY_DB_ID);
		when(beneficiary.getPublicId()).thenReturn(BENEFICIARY_ID);
		when(beneficiary.getFullName()).thenReturn("Nguyen Van B");
		when(beneficiary.getIdentityVerificationStatus()).thenReturn(Beneficiary.VERIFIED_AT_COUNTER);
		when(beneficiary.hasAccount()).thenReturn(false);
		when(beneficiary.getAccountStatus()).thenReturn(Beneficiary.ACCOUNT_NOT_CREATED, Beneficiary.ACCOUNT_CREATED);
		when(beneficiaries.findByPublicId(BENEFICIARY_ID)).thenReturn(Optional.of(beneficiary));
		when(beneficiaryRole.getRoleId()).thenReturn(5L);
		when(roles.findByRoleCode("ROLE_BENEFICIARY")).thenReturn(Optional.of(beneficiaryRole));
		when(userRoles.findByUserIdWithRole(ACCOUNT_ID)).thenReturn(List.of());
		when(encoder.encode("S3cret-pass")).thenReturn("$2a$hash");
	}

	private User account(String status, LocalDateTime deletedAt) {
		User account = mock(User.class);
		when(account.getUserId()).thenReturn(ACCOUNT_ID);
		when(account.getPublicId()).thenReturn(ACCOUNT_PUBLIC_ID);
		when(account.getStatus()).thenReturn(status);
		when(account.getDeletedAt()).thenReturn(deletedAt);
		when(users.findActiveAccountForUpdate(ACCOUNT_ID)).thenReturn(Optional.of(account));
		return account;
	}

	private static BusinessException expect(Runnable action) {
		try {
			action.run();
		} catch (BusinessException ex) {
			return ex;
		}
		throw new AssertionError("BusinessException expected");
	}

	@Test
	void linkAttachesActiveAccountGrantsBeneficiaryRoleAndAuditsWithoutPersonalData() {
		User account = account("ACTIVE", null);
		when(users.findByEmail("benef@example.com")).thenReturn(Optional.of(account));

		var response = service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("  Benef@Example.com "));

		assertThat(response.beneficiaryId()).isEqualTo(BENEFICIARY_ID);
		assertThat(response.accountId()).isEqualTo(ACCOUNT_PUBLIC_ID);
		assertThat(response.accountStatus()).isEqualTo("ACCOUNT_CREATED");
		verify(invitations).revokeForCounterLink(beneficiary, STAFF_ID);
		InOrder order = inOrder(users, cases, entities, beneficiary, beneficiaries);
		order.verify(users).findActiveAccountForUpdate(ACCOUNT_ID);
		order.verify(cases).requireOpenForWrite(VAULT_ID, STAFF_ID);
		order.verify(entities).refresh(beneficiary);
		order.verify(beneficiary).linkAccount(ACCOUNT_ID);
		order.verify(beneficiaries).save(beneficiary);
		ArgumentCaptor<UserRole> role = ArgumentCaptor.forClass(UserRole.class);
		verify(userRoles).save(role.capture());
		assertThat(role.getValue().getRole()).isSameAs(beneficiaryRole);

		@SuppressWarnings("unchecked")
		ArgumentCaptor<Map<String, Object>> details = ArgumentCaptor.forClass(Map.class);
		verify(audit).record(eq(STAFF_ID), eq(VAULT_ID), eq("BENEFICIARY_ACCOUNT_LINKED"), eq("BENEFICIARY"),
				eq(BENEFICIARY_DB_ID), eq("USER"), details.capture());
		assertThat(details.getValue()).containsEntry("stepId", "ST-24").containsEntry("ruleId", "LV-ID-001")
				.containsEntry("stateBefore", "NOT_CREATED").containsEntry("stateAfter", "ACCOUNT_CREATED")
				.containsEntry("accountPublicId", ACCOUNT_PUBLIC_ID.toString());
		assertThat(details.getValue().toString()).doesNotContain("example.com", "S3cret");
	}

	@Test
	void linkKeepsExistingBeneficiaryRoleWithoutDuplicateGrant() {
		User account = account("ACTIVE", null);
		Role existing = mock(Role.class);
		when(existing.getRoleCode()).thenReturn("ROLE_BENEFICIARY");
		UserRole link = mock(UserRole.class);
		when(link.getRole()).thenReturn(existing);
		when(userRoles.findByUserIdWithRole(ACCOUNT_ID)).thenReturn(List.of(link));
		when(users.findByEmail("benef@example.com")).thenReturn(Optional.of(account));

		service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("benef@example.com"));

		verify(userRoles, never()).save(any());
		verify(beneficiary).linkAccount(ACCOUNT_ID);
	}

	@Test
	void linkRejectsUnknownAccountWithNotFound() {
		when(users.findByEmail(anyString())).thenReturn(Optional.empty());

		BusinessException ex = expect(() -> service.link(BENEFICIARY_ID,
				new BeneficiaryAccountDtos.LinkRequest("nobody@example.com")));

		assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verify(beneficiary, never()).linkAccount(any());
		verifyNoInteractions(audit);
	}

	@Test
	void linkRejectsIneligibleAccounts() {
		User candidate1 = account("DISABLED", null);
		when(users.findByEmail("benef@example.com")).thenReturn(Optional.of(candidate1));
		assertThat(expect(() -> service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("benef@example.com")))
				.getErrorCode()).isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE);

		User candidate2 = account("ACTIVE", LocalDateTime.of(2026, 10, 1, 0, 0));
		when(users.findByEmail("benef@example.com")).thenReturn(Optional.of(candidate2));
		assertThat(expect(() -> service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("benef@example.com")))
				.getErrorCode()).isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE);

		User owner = account("ACTIVE", null);
		when(owner.getUserId()).thenReturn(OWNER_ID);
		when(users.findByEmail("benef@example.com")).thenReturn(Optional.of(owner));
		assertThat(expect(() -> service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("benef@example.com")))
				.getErrorCode()).isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE);

		for (String internal : List.of("ROLE_STAFF_EXECUTOR", "ROLE_LEGAL_VERIFIER", "ROLE_ADMIN")) {
			Role role = mock(Role.class);
			when(role.getRoleCode()).thenReturn(internal);
			UserRole link = mock(UserRole.class);
			when(link.getRole()).thenReturn(role);
			when(userRoles.findByUserIdWithRole(ACCOUNT_ID)).thenReturn(List.of(link));
			User candidate3 = account("ACTIVE", null);
			when(users.findByEmail("benef@example.com")).thenReturn(Optional.of(candidate3));
			assertThat(expect(() -> service.link(BENEFICIARY_ID,
					new BeneficiaryAccountDtos.LinkRequest("benef@example.com"))).getErrorCode())
					.isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE);
		}

		when(userRoles.findByUserIdWithRole(ACCOUNT_ID)).thenReturn(List.of());
		when(beneficiaries.existsByVault_VaultIdAndLinkedUserId(VAULT_ID, ACCOUNT_ID)).thenReturn(true);
		User candidate4 = account("ACTIVE", null);
		when(users.findByEmail("benef@example.com")).thenReturn(Optional.of(candidate4));
		assertThat(expect(() -> service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("benef@example.com")))
				.getErrorCode()).isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE);

		verify(beneficiary, never()).linkAccount(any());
		verify(userRoles, never()).save(any());
		verifyNoInteractions(audit);
	}

	@Test
	void identityMustBeVerifiedAtCounterBeforeAnyAccountWork() {
		when(beneficiary.getIdentityVerificationStatus()).thenReturn(Beneficiary.NOT_VERIFIED);

		assertThat(expect(() -> service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("a@example.com")))
				.getErrorCode()).isEqualTo(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED);
		assertThat(expect(() -> service.create(BENEFICIARY_ID,
				new BeneficiaryAccountDtos.CreateRequest("a@example.com", "S3cret-pass", null))).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED);

		verifyNoInteractions(users, audit, encoder);
	}

	@Test
	void alreadyLinkedBeneficiaryIsRejectedForBothOperations() {
		when(beneficiary.hasAccount()).thenReturn(true);

		assertThat(expect(() -> service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("a@example.com")))
				.getErrorCode()).isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED);
		assertThat(expect(() -> service.create(BENEFICIARY_ID,
				new BeneficiaryAccountDtos.CreateRequest("a@example.com", "S3cret-pass", null))).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED);
		verifyNoInteractions(audit, encoder);
	}

	@Test
	void caseGuardFailureStopsEverythingAndHidesTheRecord() {
		org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
				.when(cases).requireOpenForRead(VAULT_ID, STAFF_ID);

		assertThat(expect(() -> service.create(BENEFICIARY_ID,
				new BeneficiaryAccountDtos.CreateRequest("a@example.com", "S3cret-pass", null))).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);

		verify(entities, never()).refresh(any());
		verifyNoInteractions(users, audit, encoder);

		when(beneficiaries.findByPublicId(BENEFICIARY_ID)).thenReturn(Optional.empty());
		assertThat(expect(() -> service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("a@example.com")))
				.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
	}

	@Test
	void createBuildsActiveBcryptAccountWithBeneficiaryRoleOnlyAndNeverLogsSecrets() {
		when(users.existsByEmail("new@example.com")).thenReturn(false);
		User saved = account("ACTIVE", null);
		when(users.saveAndFlush(any(User.class))).thenReturn(saved);

		var response = service.create(BENEFICIARY_ID,
				new BeneficiaryAccountDtos.CreateRequest(" New@Example.com ", "S3cret-pass", "0912345678"));

		assertThat(response.accountId()).isEqualTo(ACCOUNT_PUBLIC_ID);
		assertThat(response.accountStatus()).isEqualTo("ACCOUNT_CREATED");
		verify(invitations).revokeForCounterLink(beneficiary, STAFF_ID);
		ArgumentCaptor<User> created = ArgumentCaptor.forClass(User.class);
		verify(users).saveAndFlush(created.capture());
		assertThat(created.getValue().getEmail()).isEqualTo("new@example.com");
		assertThat(created.getValue().getFullName()).isEqualTo("Nguyen Van B");
		assertThat(created.getValue().getPhoneNumber()).isEqualTo("0912345678");
		assertThat(created.getValue().getStatus()).isEqualTo("ACTIVE");
		assertThat(created.getValue().getPasswordHash()).isEqualTo("$2a$hash").doesNotContain("S3cret");
		verify(beneficiary).linkAccount(ACCOUNT_ID);
		verify(userRoles, times(1)).save(any(UserRole.class));

		@SuppressWarnings("unchecked")
		ArgumentCaptor<Map<String, Object>> details = ArgumentCaptor.forClass(Map.class);
		verify(audit).record(eq(STAFF_ID), eq(VAULT_ID), eq("BENEFICIARY_ACCOUNT_CREATED"), eq("BENEFICIARY"),
				eq(BENEFICIARY_DB_ID), eq("USER"), details.capture());
		assertThat(details.getValue().toString()).doesNotContain("S3cret", "$2a$", "new@example.com", "0912345678");
	}

	@Test
	void createRejectsDuplicateEmailWithoutLeavingAnyChange() {
		when(users.existsByEmail("dup@example.com")).thenReturn(true);

		assertThat(expect(() -> service.create(BENEFICIARY_ID,
				new BeneficiaryAccountDtos.CreateRequest("dup@example.com", "S3cret-pass", null))).getErrorCode())
				.isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);

		verify(users, never()).saveAndFlush(any());
		verify(beneficiary, never()).linkAccount(any());
		verifyNoInteractions(audit, invitations);
	}

	@Test
	void createMapsConcurrentDuplicateEmailToConflict() {
		when(users.existsByEmail("race@example.com")).thenReturn(false);
		when(users.saveAndFlush(any(User.class))).thenThrow(new DataIntegrityViolationException("duplicate"));

		assertThat(expect(() -> service.create(BENEFICIARY_ID,
				new BeneficiaryAccountDtos.CreateRequest("race@example.com", "S3cret-pass", null))).getErrorCode())
				.isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
		verify(beneficiary, never()).linkAccount(any());
		verify(audit, never()).record(any(), any(), anyString(), anyString(), any(), anyString(), anyMap());
	}

	@Test
	void createRequestToStringRedactsThePassword() {
		var request = new BeneficiaryAccountDtos.CreateRequest("a@example.com", "S3cret-pass", null);
		assertThatThrownBy(() -> { throw new IllegalStateException(request.toString()); })
				.hasMessageNotContaining("S3cret");
	}

	@Test
	void readCaseAuthorizationMustPrecedeAnyTargetAccountLookupOrLock() {
		org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
				.when(cases).requireOpenForRead(VAULT_ID, STAFF_ID);
		assertThat(expect(() -> service.link(BENEFICIARY_ID, new BeneficiaryAccountDtos.LinkRequest("target@example.com")))
				.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verifyNoInteractions(users, audit);
		verify(cases, never()).requireOpenForWrite(any(), any());
	}
}
