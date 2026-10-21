package com.legacyvault.beneficiary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

/** PS-88 (ST-14, ST-24): the counter read model derives steps and actions from server data only. */
class CounterBeneficiaryServiceTest {

	private static final Long STAFF_ID = 7L;
	private static final Long VAULT_ID = 9L;
	private static final UUID CASE_ID = UUID.randomUUID();

	private final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
	private final StaffVaultCaseGuard guard = mock(StaffVaultCaseGuard.class);
	private final BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
	private final BeneficiaryInvitationRepository invitations = mock(BeneficiaryInvitationRepository.class);
	private final BeneficiaryCounterAttestationRepository attestations = mock(BeneficiaryCounterAttestationRepository.class);
	private final StaffContextService staff = mock(StaffContextService.class);
	private final CounterBeneficiaryService service =
			new CounterBeneficiaryService(cases, guard, beneficiaries, invitations, attestations, staff);

	private final VerificationCase verificationCase = mock(VerificationCase.class);

	CounterBeneficiaryServiceTest() {
		User actor = mock(User.class);
		when(actor.getUserId()).thenReturn(STAFF_ID);
		when(staff.requireStaff()).thenReturn(actor);
		when(verificationCase.getVaultId()).thenReturn(VAULT_ID);
		when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.of(verificationCase));
	}

	private static Beneficiary beneficiary(long id, String identity, boolean linked) {
		Beneficiary b = mock(Beneficiary.class);
		when(b.getId()).thenReturn(id);
		when(b.getPublicId()).thenReturn(UUID.randomUUID());
		when(b.getFullName()).thenReturn("Nguyen Van " + id);
		when(b.getRelationship()).thenReturn("Con");
		when(b.getIdentityVerificationStatus()).thenReturn(identity);
		when(b.hasAccount()).thenReturn(linked);
		when(b.getAccountStatus()).thenReturn(linked ? "ACCOUNT_CREATED" : "NOT_CREATED");
		return b;
	}

	private static BeneficiaryInvitation invitation(Beneficiary owner, String state) {
		BeneficiaryInvitation i = mock(BeneficiaryInvitation.class);
		when(i.getBeneficiary()).thenReturn(owner);
		when(i.state(any(LocalDateTime.class))).thenReturn(state);
		when(i.getExpiresAt()).thenReturn(LocalDateTime.of(2026, 10, 27, 8, 0));
		return i;
	}

	@Test
	void listDerivesStepAndActionsFromIdentityAndLink() {
		Beneficiary waiting = beneficiary(1, Beneficiary.NOT_VERIFIED, false);
		Beneficiary decision = beneficiary(2, Beneficiary.VERIFIED_AT_COUNTER, false);
		Beneficiary linked = beneficiary(3, Beneficiary.VERIFIED_AT_COUNTER, true);
		when(beneficiaries.findAllByVault_VaultIdOrderByIdAsc(VAULT_ID)).thenReturn(List.of(waiting, decision, linked));
		BeneficiaryInvitation pending = invitation(decision, "PENDING");
		BeneficiaryInvitation consumed = invitation(linked, "CONSUMED");
		when(invitations.findAllByBeneficiary_Vault_VaultIdAndCurrentTrue(VAULT_ID))
				.thenReturn(List.of(pending, consumed));

		var items = service.list(CASE_ID);

		assertThat(items).extracting(CounterBeneficiaryDtos.Item::counterStep).containsExactly(
				"AWAITING_IDENTITY_VERIFICATION", "AWAITING_ACCOUNT_DECISION", "ACCOUNT_LINKED");
		assertThat(items.get(0).invitation().state()).isEqualTo("NOT_ISSUED");
		assertThat(items.get(0).invitation().expiresAt()).isNull();
		assertThat(items.get(0).actions()).isEqualTo(new CounterBeneficiaryDtos.Actions(false, false, false, false));
		assertThat(items.get(1).invitation().state()).isEqualTo("PENDING");
		assertThat(items.get(1).invitation().expiresAt())
				.isEqualTo(LocalDateTime.of(2026, 10, 27, 8, 0).toInstant(ZoneOffset.UTC));
		assertThat(items.get(1).actions()).isEqualTo(new CounterBeneficiaryDtos.Actions(true, true, true, false));
		assertThat(items.get(2).accountLinked()).isTrue();
		assertThat(items.get(2).actions()).isEqualTo(new CounterBeneficiaryDtos.Actions(false, false, true, false));
		assertThat(items).extracting(CounterBeneficiaryDtos.Item::caseId).containsOnly(CASE_ID);
	}

	@Test
	void anAccountIsNeverRequiredToHandOver_onlyTheInPersonCheck() {
		Beneficiary offline = beneficiary(1, Beneficiary.VERIFIED_AT_COUNTER, false);
		when(beneficiaries.findAllByVault_VaultIdOrderByIdAsc(VAULT_ID)).thenReturn(List.of(offline));
		when(invitations.findAllByBeneficiary_Vault_VaultIdAndCurrentTrue(VAULT_ID)).thenReturn(List.of());

		assertThat(service.list(CASE_ID).get(0).actions().canHandOverWithoutAccount()).isTrue();
	}

	@Test
	void caseNotAssignedToStaffIsNotFound_andNothingIsRead() {
		when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());

		assertThat(codeOf(() -> service.list(CASE_ID))).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		assertThat(codeOf(() -> service.get(CASE_ID, UUID.randomUUID()))).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verifyNoInteractions(guard, beneficiaries, invitations);
	}

	@Test
	void closedOrOtherwiseUnavailableCaseStopsAtTheGuard() {
		org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
				.when(guard).requireOpenForRead(VAULT_ID, STAFF_ID);

		assertThat(codeOf(() -> service.list(CASE_ID))).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verify(beneficiaries, never()).findAllByVault_VaultIdOrderByIdAsc(any());
	}

	@Test
	void getReturnsOneBeneficiaryOfTheCaseVaultOnly() {
		Beneficiary mine = beneficiary(5, Beneficiary.VERIFIED_AT_COUNTER, false);
		UUID id = mine.getPublicId();
		when(beneficiaries.findByPublicIdAndVault_VaultId(id, VAULT_ID)).thenReturn(Optional.of(mine));
		BeneficiaryInvitation expired = invitation(mine, "EXPIRED");
		when(invitations.findByBeneficiary_IdAndCurrentTrue(5L)).thenReturn(Optional.of(expired));

		var item = service.get(CASE_ID, id);

		assertThat(item.beneficiaryId()).isEqualTo(id);
		assertThat(item.invitation().state()).isEqualTo("EXPIRED");
		UUID other = UUID.randomUUID();
		when(beneficiaries.findByPublicIdAndVault_VaultId(other, VAULT_ID)).thenReturn(Optional.empty());
		assertThat(codeOf(() -> service.get(CASE_ID, other))).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
	}

	@Test
	void theResponseCarriesNoContactOrSecretFields() {
		var names = java.util.Arrays.stream(CounterBeneficiaryDtos.Item.class.getRecordComponents())
				.map(java.lang.reflect.RecordComponent::getName).toList();

		assertThat(names).doesNotContain("email", "phone", "identityNumber", "code", "codeHash", "accountId");
	}

	private static ErrorCode codeOf(Runnable action) {
		try {
			action.run();
		} catch (BusinessException ex) {
			return ex.getErrorCode();
		}
		throw new AssertionError("BusinessException expected");
	}
}
