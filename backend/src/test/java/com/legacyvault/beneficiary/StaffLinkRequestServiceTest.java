package com.legacyvault.beneficiary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

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
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

import jakarta.persistence.EntityManager;

/** BE-01: Staff confirmation. Uses the real BeneficiaryAccountService linker so link, role and audit are exercised. */
class StaffLinkRequestServiceTest {

	private static final Long STAFF_ID = 7L;
	private static final Long VAULT_ID = 9L;
	private static final Long OWNER_ID = 3L;
	private static final Long CASE_DB_ID = 123L;
	private static final Long ACCOUNT_ID = 21L;
	private static final Long BENEFICIARY_DB_ID = 12L;
	private static final UUID CASE_ID = UUID.randomUUID();
	private static final UUID BENEFICIARY_ID = UUID.randomUUID();
	private static final UUID ACCOUNT_PUBLIC_ID = UUID.randomUUID();

	private final BeneficiaryLinkRequestRepository requests = mock(BeneficiaryLinkRequestRepository.class);
	private final BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
	private final StaffCaseLockRepository caseLookup = mock(StaffCaseLockRepository.class);
	private final StaffVaultCaseGuard guard = mock(StaffVaultCaseGuard.class);
	private final StaffContextService staff = mock(StaffContextService.class);
	private final UserRepository users = mock(UserRepository.class);
	private final RoleRepository roles = mock(RoleRepository.class);
	private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
	private final AuditService audit = mock(AuditService.class);
	private final EntityManager entities = mock(EntityManager.class);
	private final BeneficiaryInvitationService invitations = mock(BeneficiaryInvitationService.class);
	private final BeneficiaryAccountService linker = new BeneficiaryAccountService(beneficiaries, staff, guard, entities,
			users, roles, userRoles, mock(PasswordEncoder.class), audit, invitations);
	private final StaffLinkRequestService service = new StaffLinkRequestService(requests, beneficiaries, caseLookup,
			guard, staff, users, linker, audit, entities);

	private final User actor = mock(User.class);
	private final User account = mock(User.class);
	private final VerificationCase ownedCase = mock(VerificationCase.class);
	private final Vault vault = mock(Vault.class);
	private final Beneficiary beneficiary = mock(Beneficiary.class);
	private final Role beneficiaryRole = mock(Role.class);
	private BeneficiaryLinkRequest request;

	StaffLinkRequestServiceTest() {
		when(actor.getUserId()).thenReturn(STAFF_ID);
		when(staff.requireStaff()).thenReturn(actor);
		when(ownedCase.isOpen()).thenReturn(true);
		when(ownedCase.getVerificationCaseId()).thenReturn(CASE_DB_ID);
		when(ownedCase.getVaultId()).thenReturn(VAULT_ID);
		when(caseLookup.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.of(ownedCase));

		request = pending(ACCOUNT_ID, CASE_DB_ID);
		when(requests.findByPublicId(request.getPublicId())).thenReturn(Optional.of(request));
		when(requests.findByPublicIdForUpdate(request.getPublicId())).thenReturn(Optional.of(request));

		when(account.getUserId()).thenReturn(ACCOUNT_ID);
		when(account.getPublicId()).thenReturn(ACCOUNT_PUBLIC_ID);
		when(account.getStatus()).thenReturn("ACTIVE");
		when(users.findActiveAccountForUpdate(ACCOUNT_ID)).thenReturn(Optional.of(account));
		when(userRoles.findByUserIdWithRole(ACCOUNT_ID)).thenReturn(List.of());
		when(roles.findByRoleCode("ROLE_BENEFICIARY")).thenReturn(Optional.of(beneficiaryRole));

		when(vault.getVaultId()).thenReturn(VAULT_ID);
		when(vault.getOwnerUserId()).thenReturn(OWNER_ID);
		when(beneficiary.getVault()).thenReturn(vault);
		when(beneficiary.getId()).thenReturn(BENEFICIARY_DB_ID);
		when(beneficiary.getPublicId()).thenReturn(BENEFICIARY_ID);
		when(beneficiary.getIdentityVerificationStatus()).thenReturn(Beneficiary.VERIFIED_AT_COUNTER);
		when(beneficiary.getAccountStatus()).thenReturn(Beneficiary.ACCOUNT_NOT_CREATED, Beneficiary.ACCOUNT_CREATED);
		when(beneficiaries.findByPublicIdAndVault_VaultId(BENEFICIARY_ID, VAULT_ID)).thenReturn(Optional.of(beneficiary));
	}

	private static BeneficiaryLinkRequest pending(Long accountId, Long caseId) {
		var made = new BeneficiaryLinkRequest(accountId, caseId, LocalDateTime.now(ZoneOffset.UTC).plusDays(1));
		ReflectionTestUtils.setField(made, "createdAt", LocalDateTime.now(ZoneOffset.UTC));
		return made;
	}

	private static BusinessException error(Runnable action) {
		try {
			action.run();
		} catch (BusinessException ex) {
			return ex;
		}
		throw new AssertionError("BusinessException expected");
	}

	@Test
	void approveLinksTheStoredRequesterAndRecordsEverythingTogether() {
		var decision = service.approve(CASE_ID, request.getPublicId(), BENEFICIARY_ID);

		assertThat(decision.status()).isEqualTo("APPROVED");
		assertThat(decision.accountId()).isEqualTo(ACCOUNT_PUBLIC_ID);
		assertThat(request.getBeneficiaryId()).isEqualTo(BENEFICIARY_DB_ID);
		InOrder order = inOrder(users, guard, beneficiary, userRoles, invitations, requests);
		order.verify(users).findActiveAccountForUpdate(ACCOUNT_ID);
		order.verify(guard).requireOpenForWrite(VAULT_ID, STAFF_ID);
		order.verify(userRoles).save(any(UserRole.class));
		order.verify(beneficiary).linkAccount(ACCOUNT_ID);
		order.verify(invitations).revokeForCounterLink(beneficiary, STAFF_ID);
		order.verify(requests).saveAndFlush(request);
		verify(audit).record(eq(STAFF_ID), eq(VAULT_ID), eq("BENEFICIARY_ACCOUNT_LINKED"), eq("BENEFICIARY"),
				eq(BENEFICIARY_DB_ID), eq("USER"), anyMap());
		verify(audit).record(eq(STAFF_ID), eq(VAULT_ID), eq("BENEFICIARY_LINK_REQUEST_APPROVED"),
				eq("BENEFICIARY_LINK_REQUEST"), any(), eq("USER"), anyMap());
	}

	@Test
	void approveBodyCarriesNoAccountSoAClientCannotRedirectTheLink() {
		assertThat(BeneficiaryLinkRequestDtos.ApproveRequest.class.getRecordComponents())
				.extracting(c -> c.getName()).containsExactly("beneficiaryId");
		service.approve(CASE_ID, request.getPublicId(), BENEFICIARY_ID);

		verify(users, never()).findByEmail(any());
		verify(beneficiary).linkAccount(ACCOUNT_ID);
	}

	@Test
	void staffWithoutTheCaseCannotSeeOrDecideItsRequests() {
		UUID otherCase = UUID.randomUUID();
		when(caseLookup.findOwnedByStaff(otherCase, STAFF_ID)).thenReturn(Optional.empty());

		assertThat(error(() -> service.listPending(otherCase)).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		assertThat(error(() -> service.approve(otherCase, request.getPublicId(), BENEFICIARY_ID)).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		assertThat(error(() -> service.reject(otherCase, request.getPublicId())).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verify(beneficiary, never()).linkAccount(any());
	}

	@Test
	void requestFromAnotherCaseIsNotFoundEvenForAnOwnedCase() {
		var foreign = pending(ACCOUNT_ID, 999L);
		when(requests.findByPublicId(foreign.getPublicId())).thenReturn(Optional.of(foreign));

		assertThat(error(() -> service.approve(CASE_ID, foreign.getPublicId(), BENEFICIARY_ID)).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		assertThat(foreign.getStatus()).isEqualTo("PENDING");
	}

	@Test
	void rejectNeverLinksOrGrantsAnything() {
		var decision = service.reject(CASE_ID, request.getPublicId());

		assertThat(decision.status()).isEqualTo("REJECTED");
		assertThat(decision.accountId()).isNull();
		verify(beneficiary, never()).linkAccount(any());
		verify(userRoles, never()).save(any());
		verify(invitations, never()).revokeForCounterLink(any(), any());
	}

	@Test
	void secondApprovalForTheSameRecipientLosesAndLeavesItsRequestPending() {
		service.approve(CASE_ID, request.getPublicId(), BENEFICIARY_ID);

		// The recipient is now linked; a second, competing request must not create another link.
		var rival = pending(22L, CASE_DB_ID);
		when(requests.findByPublicId(rival.getPublicId())).thenReturn(Optional.of(rival));
		when(requests.findByPublicIdForUpdate(rival.getPublicId())).thenReturn(Optional.of(rival));
		User rivalAccount = mock(User.class);
		when(rivalAccount.getUserId()).thenReturn(22L);
		when(rivalAccount.getStatus()).thenReturn("ACTIVE");
		when(users.findActiveAccountForUpdate(22L)).thenReturn(Optional.of(rivalAccount));
		when(beneficiary.hasAccount()).thenReturn(true);

		assertThat(error(() -> service.approve(CASE_ID, rival.getPublicId(), BENEFICIARY_ID)).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED);
		assertThat(rival.getStatus()).isEqualTo("PENDING");
		verify(beneficiary).linkAccount(any()); // exactly one link overall
	}

	@Test
	void unverifiedRecipientCannotBeLinked() {
		when(beneficiary.getIdentityVerificationStatus()).thenReturn("NOT_VERIFIED");

		assertThat(error(() -> service.approve(CASE_ID, request.getPublicId(), BENEFICIARY_ID)).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED);
		assertThat(request.getStatus()).isEqualTo("PENDING");
	}

	@Test
	void ineligibleRequesterIsRefused() {
		when(vault.getOwnerUserId()).thenReturn(ACCOUNT_ID);

		assertThat(error(() -> service.approve(CASE_ID, request.getPublicId(), BENEFICIARY_ID)).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE);
		verify(beneficiary, never()).linkAccount(any());
	}

	@Test
	void inactiveRequesterAccountIsRefused() {
		when(users.findActiveAccountForUpdate(ACCOUNT_ID)).thenReturn(Optional.empty());

		assertThat(error(() -> service.approve(CASE_ID, request.getPublicId(), BENEFICIARY_ID)).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE);
	}

	@Test
	void cancelledExpiredOrAlreadyDecidedRequestsCannotBeApprovedOrRejected() {
		var cancelled = pending(ACCOUNT_ID, CASE_DB_ID);
		cancelled.cancel(LocalDateTime.now(ZoneOffset.UTC));
		var expired = new BeneficiaryLinkRequest(ACCOUNT_ID, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1));
		var rejected = pending(ACCOUNT_ID, CASE_DB_ID);
		rejected.reject(STAFF_ID, LocalDateTime.now(ZoneOffset.UTC));
		for (var stale : List.of(cancelled, expired, rejected)) {
			when(requests.findByPublicId(stale.getPublicId())).thenReturn(Optional.of(stale));
			when(requests.findByPublicIdForUpdate(stale.getPublicId())).thenReturn(Optional.of(stale));
			assertThat(error(() -> service.approve(CASE_ID, stale.getPublicId(), BENEFICIARY_ID)).getErrorCode())
					.isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_NOT_PENDING);
			assertThat(error(() -> service.reject(CASE_ID, stale.getPublicId())).getErrorCode())
					.isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_NOT_PENDING);
		}
		verify(beneficiary, never()).linkAccount(any());
	}

	@Test
	void failureWhileLinkingNeverMarksTheRequestApproved() {
		doThrow(new IllegalStateException("audit down")).when(audit).record(any(), any(), eq("BENEFICIARY_ACCOUNT_LINKED"),
				any(), any(), any(), any());

		org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
				() -> service.approve(CASE_ID, request.getPublicId(), BENEFICIARY_ID));

		// The exception propagates out of the @Transactional method, so the link/role writes roll back with it;
		// the request itself was never advanced past PENDING.
		assertThat(request.getStatus()).isEqualTo("PENDING");
		verify(requests, never()).saveAndFlush(any());
	}

	@Test
	void listShowsOnlyOpenRequestsOfTheOwnedCaseWithRequesterIdentityForCounterCheck() {
		var live = request;
		var stale = new BeneficiaryLinkRequest(23L, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1));
		ReflectionTestUtils.setField(stale, "createdAt", LocalDateTime.now(ZoneOffset.UTC).minusDays(8));
		when(requests.findByVerificationCaseIdAndStatusOrderByCreatedAtAsc(CASE_DB_ID, "PENDING"))
				.thenReturn(List.of(live, stale));
		when(account.getFullName()).thenReturn("Nguyen Van B");
		when(account.getEmail()).thenReturn("b@example.com");
		when(users.findById(ACCOUNT_ID)).thenReturn(Optional.of(account));

		var list = service.listPending(CASE_ID);

		assertThat(list).hasSize(1);
		assertThat(list.get(0).requesterEmail()).isEqualTo("b@example.com");
		assertThat(list.get(0).requestId()).isEqualTo(live.getPublicId());
	}
}
