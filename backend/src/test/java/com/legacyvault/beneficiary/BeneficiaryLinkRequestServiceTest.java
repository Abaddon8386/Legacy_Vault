package com.legacyvault.beneficiary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;

/** BE-01: recipient-side link requests. A request is only ever PENDING; it never links or grants anything. */
class BeneficiaryLinkRequestServiceTest {

	private static final Long ACCOUNT_ID = 21L;
	private static final Long OWNER_ID = 3L;
	private static final Long CASE_DB_ID = 123L;
	private static final Long VAULT_ID = 9L;

	private final BeneficiaryLinkRequestRepository requests = mock(BeneficiaryLinkRequestRepository.class);
	private final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
	private final VaultRepository vaults = mock(VaultRepository.class);
	private final UserRepository users = mock(UserRepository.class);
	private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
	private final AuditService audit = mock(AuditService.class);
	private final BeneficiaryLinkRequestService service = new BeneficiaryLinkRequestService(requests, cases, vaults,
			users, userRoles, audit, 7);

	private final User account = mock(User.class);
	private final VerificationCase openCase = mock(VerificationCase.class);
	private final Vault vault = mock(Vault.class);

	BeneficiaryLinkRequestServiceTest() {
		when(users.findActiveAccountForUpdate(ACCOUNT_ID)).thenReturn(Optional.of(account));
		when(userRoles.findByUserIdWithRole(ACCOUNT_ID)).thenReturn(List.of());
		when(openCase.isOpen()).thenReturn(true);
		when(openCase.getAssignedStaffUserId()).thenReturn(7L);
		when(openCase.getVerificationCaseId()).thenReturn(CASE_DB_ID);
		when(openCase.getVaultId()).thenReturn(VAULT_ID);
		when(openCase.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 10, 1, 8, 0));
		when(cases.findById(CASE_DB_ID)).thenReturn(Optional.of(openCase));
		when(vault.getOwnerUserId()).thenReturn(OWNER_ID);
		when(vaults.findById(VAULT_ID)).thenReturn(Optional.of(vault));
		when(requests.saveAndFlush(any(BeneficiaryLinkRequest.class))).thenAnswer(call -> {
			BeneficiaryLinkRequest saved = call.getArgument(0);
			ReflectionTestUtils.setField(saved, "createdAt", LocalDateTime.now(ZoneOffset.UTC));
			return saved;
		});
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
	void submitCreatesPendingRequestWithoutLinkingOrGrantingAnything() {
		var created = service.submit(ACCOUNT_ID, " hs-2026-000123 ");

		assertThat(created.status()).isEqualTo("PENDING");
		assertThat(created.expiresAt()).isAfter(created.createdAt());
		verify(audit).record(eq(ACCOUNT_ID), eq(VAULT_ID), eq("BENEFICIARY_LINK_REQUESTED"),
				eq("BENEFICIARY_LINK_REQUEST"), any(), eq("USER"), anyMap());
		// No role is written and no recipient is touched by a submit.
		verify(userRoles, never()).save(any(UserRole.class));
	}

	@Test
	void accountWithoutBeneficiaryRoleMayStillSubmit() {
		when(userRoles.findByUserIdWithRole(ACCOUNT_ID)).thenReturn(List.of());

		assertThat(service.submit(ACCOUNT_ID, "HS-2026-000123").status()).isEqualTo("PENDING");
	}

	@Test
	void unusableCodesAllGetTheSameGenericErrorSoTheyCannotProbeCases() {
		VerificationCase closed = mock(VerificationCase.class);
		when(closed.isOpen()).thenReturn(false);
		when(cases.findById(500L)).thenReturn(Optional.of(closed));
		when(cases.findById(404L)).thenReturn(Optional.empty());

		for (String code : new String[] { null, "", "garbage", "HS-2026-000404", "HS-2026-000500", "HS-2025-000123" }) {
			assertThat(error(() -> service.submit(ACCOUNT_ID, code)).getErrorCode())
					.as(String.valueOf(code)).isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_INVALID);
		}
		verify(requests, never()).saveAndFlush(any());
	}

	@Test
	void caseNotYetTakenByStaffIsRejected() {
		when(openCase.getAssignedStaffUserId()).thenReturn(null);

		assertThat(error(() -> service.submit(ACCOUNT_ID, "HS-2026-000123")).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_INVALID);
	}

	@Test
	void vaultOwnerCannotRequestALinkToTheirOwnCase() {
		when(vault.getOwnerUserId()).thenReturn(ACCOUNT_ID);

		assertThat(error(() -> service.submit(ACCOUNT_ID, "HS-2026-000123")).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_INVALID);
	}

	@Test
	void internalAuthoritiesCannotRequest() {
		Role staffRole = mock(Role.class);
		when(staffRole.getRoleCode()).thenReturn("ROLE_STAFF_EXECUTOR");
		UserRole link = mock(UserRole.class);
		when(link.getRole()).thenReturn(staffRole);
		when(userRoles.findByUserIdWithRole(ACCOUNT_ID)).thenReturn(List.of(link));

		assertThat(error(() -> service.submit(ACCOUNT_ID, "HS-2026-000123")).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_INVALID);
	}

	@Test
	void duplicatePendingRequestIsRejected() {
		var existing = new BeneficiaryLinkRequest(ACCOUNT_ID, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).plusDays(1));
		when(requests.findByRequesterUserIdAndVerificationCaseIdAndStatus(ACCOUNT_ID, CASE_DB_ID, "PENDING"))
				.thenReturn(Optional.of(existing));

		assertThat(error(() -> service.submit(ACCOUNT_ID, "HS-2026-000123")).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_ALREADY_PENDING);
	}

	@Test
	void expiredPendingRequestIsClosedSoTheAccountCanRetry() {
		var stale = new BeneficiaryLinkRequest(ACCOUNT_ID, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1));
		when(requests.findByRequesterUserIdAndVerificationCaseIdAndStatus(ACCOUNT_ID, CASE_DB_ID, "PENDING"))
				.thenReturn(Optional.of(stale));

		assertThat(service.submit(ACCOUNT_ID, "HS-2026-000123").status()).isEqualTo("PENDING");
		assertThat(stale.getStatus()).isEqualTo("EXPIRED");
	}

	@Test
	void tooManyPendingRequestsAreRejected() {
		when(requests.countByRequesterUserIdAndStatus(ACCOUNT_ID, "PENDING"))
				.thenReturn((long) BeneficiaryLinkRequestService.MAX_PENDING_PER_ACCOUNT);

		assertThat(error(() -> service.submit(ACCOUNT_ID, "HS-2026-000123")).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_LIMIT);
	}

	@Test
	void concurrentDuplicateLosesToTheUniqueIndex() {
		when(requests.saveAndFlush(any(BeneficiaryLinkRequest.class))).thenThrow(new DataIntegrityViolationException("dup"));

		assertThat(error(() -> service.submit(ACCOUNT_ID, "HS-2026-000123")).getErrorCode())
				.isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_ALREADY_PENDING);
	}

	@Test
	void listReturnsOnlyTheCallersOwnRequestsAndNoCaseData() {
		var mine = new BeneficiaryLinkRequest(ACCOUNT_ID, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).plusDays(1));
		ReflectionTestUtils.setField(mine, "createdAt", LocalDateTime.now(ZoneOffset.UTC));
		when(requests.findByRequesterUserIdOrderByCreatedAtDesc(ACCOUNT_ID)).thenReturn(List.of(mine));

		var list = service.listMine(ACCOUNT_ID);

		assertThat(list).hasSize(1);
		assertThat(list.get(0).requestId()).isEqualTo(mine.getPublicId());
		assertThat(BeneficiaryLinkRequestDtos.MyRequest.class.getRecordComponents())
				.extracting(c -> c.getName()).containsExactly("requestId", "status", "createdAt", "expiresAt");
	}

	@Test
	void expiredRequestIsReportedAsExpired() {
		var old = new BeneficiaryLinkRequest(ACCOUNT_ID, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).minusDays(1));
		ReflectionTestUtils.setField(old, "createdAt", LocalDateTime.now(ZoneOffset.UTC).minusDays(8));
		when(requests.findByRequesterUserIdOrderByCreatedAtDesc(ACCOUNT_ID)).thenReturn(List.of(old));

		assertThat(service.listMine(ACCOUNT_ID).get(0).status()).isEqualTo("EXPIRED");
	}

	@Test
	void cancelMovesOwnPendingRequestToCancelled() {
		var mine = new BeneficiaryLinkRequest(ACCOUNT_ID, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).plusDays(1));
		when(requests.findByPublicIdForUpdate(mine.getPublicId())).thenReturn(Optional.of(mine));

		ReflectionTestUtils.setField(mine, "createdAt", LocalDateTime.now(ZoneOffset.UTC));

		assertThat(service.cancel(ACCOUNT_ID, mine.getPublicId()).status()).isEqualTo("CANCELLED");
		verify(audit).record(eq(ACCOUNT_ID), eq(VAULT_ID), eq("BENEFICIARY_LINK_REQUEST_CANCELLED"),
				eq("BENEFICIARY_LINK_REQUEST"), any(), eq("USER"), anyMap());
	}

	@Test
	void anotherAccountsRequestLooksNonexistent() {
		var theirs = new BeneficiaryLinkRequest(99L, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).plusDays(1));
		when(requests.findByPublicIdForUpdate(theirs.getPublicId())).thenReturn(Optional.of(theirs));

		assertThat(error(() -> service.cancel(ACCOUNT_ID, theirs.getPublicId())).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		assertThat(theirs.getStatus()).isEqualTo("PENDING");
	}

	@Test
	void decidedOrExpiredRequestCannotBeCancelled() {
		var approved = new BeneficiaryLinkRequest(ACCOUNT_ID, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).plusDays(1));
		approved.approve(5L, 7L, LocalDateTime.now(ZoneOffset.UTC));
		var expired = new BeneficiaryLinkRequest(ACCOUNT_ID, CASE_DB_ID, LocalDateTime.now(ZoneOffset.UTC).minusDays(1));
		when(requests.findByPublicIdForUpdate(approved.getPublicId())).thenReturn(Optional.of(approved));
		when(requests.findByPublicIdForUpdate(expired.getPublicId())).thenReturn(Optional.of(expired));

		for (var request : List.of(approved, expired)) {
			assertThat(error(() -> service.cancel(ACCOUNT_ID, request.getPublicId())).getErrorCode())
					.isEqualTo(ErrorCode.BENEFICIARY_LINK_REQUEST_NOT_PENDING);
		}
		assertThat(approved.getStatus()).isEqualTo("APPROVED");
	}

	@Test
	void inactiveAccountIsTreatedAsUnauthenticated() {
		when(users.findActiveAccountForUpdate(ACCOUNT_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.submit(ACCOUNT_ID, "HS-2026-000123")).isInstanceOf(BusinessException.class);
		verifyNoInteractions(cases);
		verify(audit, never()).record(any(), any(), anyString(), anyString(), any(), anyString(), anyMap());
	}
}
