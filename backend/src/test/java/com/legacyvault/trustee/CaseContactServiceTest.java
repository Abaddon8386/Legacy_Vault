package com.legacyvault.trustee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

/** Staff reads the contact details of an assigned OPEN case only, and each read is audited. */
class CaseContactServiceTest {

	private static final Long STAFF_ID = 7L;
	private static final Long VAULT_ID = 9L;
	private static final Long CASE_DB_ID = 11L;
	private static final UUID CASE_ID = UUID.randomUUID();

	private final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
	private final StaffVaultCaseGuard guard = mock(StaffVaultCaseGuard.class);
	private final TrusteeRepository trustees = mock(TrusteeRepository.class);
	private final BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
	private final TrusteeContactRecordRepository records = mock(TrusteeContactRecordRepository.class);
	private final StaffContextService staff = mock(StaffContextService.class);
	private final AuditService audit = mock(AuditService.class);
	private final CaseContactService service =
			new CaseContactService(cases, guard, trustees, beneficiaries, records, staff, audit);

	private final VerificationCase verificationCase = mock(VerificationCase.class);

	CaseContactServiceTest() {
		User actor = mock(User.class);
		when(actor.getUserId()).thenReturn(STAFF_ID);
		when(staff.requireStaff()).thenReturn(actor);
		when(verificationCase.getVaultId()).thenReturn(VAULT_ID);
		when(verificationCase.getVerificationCaseId()).thenReturn(CASE_DB_ID);
	}

	@Test
	void listsTheAppointedTrusteeThenTheBeneficiariesWithTheirContactDetailsAndAuditsTheRead() {
		when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.of(verificationCase));
		Trustee trustee = mock(Trustee.class);
		UUID trusteeId = UUID.randomUUID();
		when(trustee.getPublicId()).thenReturn(trusteeId);
		when(trustee.getFullName()).thenReturn("Duong Van Tam");
		when(trustee.getRelationship()).thenReturn("Em trai chu kho");
		when(trustee.getPhone()).thenReturn("0903456789");
		when(trustee.getEmail()).thenReturn("tam@example.com");
		when(trustees.findAllByVault_VaultIdAndStatusOrderByIdAsc(VAULT_ID, "APPOINTED")).thenReturn(List.of(trustee));
		when(records.findAllByTrustee_PublicIdOrderByOccurredAtDesc(trusteeId)).thenReturn(List.of());
		Beneficiary beneficiary = mock(Beneficiary.class);
		UUID beneficiaryId = UUID.randomUUID();
		when(beneficiary.getPublicId()).thenReturn(beneficiaryId);
		when(beneficiary.getFullName()).thenReturn("Duong Thi Lan");
		when(beneficiary.getRelationship()).thenReturn("Con gai");
		when(beneficiary.getPhone()).thenReturn("0912345678");
		when(beneficiary.getEmail()).thenReturn("lan@example.com");
		when(beneficiaries.findAllByVault_VaultIdOrderByIdAsc(VAULT_ID)).thenReturn(List.of(beneficiary));

		CaseContactDtos.Response response = service.list(CASE_ID);

		assertThat(response.caseId()).isEqualTo(CASE_ID);
		assertThat(response.people()).hasSize(2);
		CaseContactDtos.Person first = response.people().get(0);
		assertThat(first.kind()).isEqualTo("TRUSTEE");
		assertThat(first.id()).isEqualTo(trusteeId);
		assertThat(first.phone()).isEqualTo("0903456789");
		assertThat(first.email()).isEqualTo("tam@example.com");
		assertThat(first.canRecord()).isTrue();
		CaseContactDtos.Person second = response.people().get(1);
		assertThat(second.kind()).isEqualTo("BENEFICIARY");
		assertThat(second.id()).isEqualTo(beneficiaryId);
		assertThat(second.email()).isEqualTo("lan@example.com");
		assertThat(second.canRecord()).isFalse();
		assertThat(second.contacts()).isEmpty();
		verify(guard).requireOpenForRead(VAULT_ID, STAFF_ID);
		verify(audit).record(eq(STAFF_ID), eq(VAULT_ID), eq("CASE_CONTACTS_VIEWED"), eq("VERIFICATION_CASE"),
				eq(CASE_DB_ID), eq("USER"), anyMap());
	}

	@Test
	void aCaseNotAssignedToThisStaffIsNotFoundAndNothingIsRead() {
		when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.list(CASE_ID)).isInstanceOfSatisfying(BusinessException.class,
				e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
		verifyNoInteractions(trustees, beneficiaries, records, audit);
	}

	@Test
	void aClosedCaseIsRefusedByTheGuardAndNothingIsReadOrAudited() {
		when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.of(verificationCase));
		org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND)).when(guard)
				.requireOpenForRead(VAULT_ID, STAFF_ID);

		assertThatThrownBy(() -> service.list(CASE_ID)).isInstanceOf(BusinessException.class);
		verifyNoInteractions(trustees, beneficiaries, records, audit);
		verify(audit, org.mockito.Mockito.never()).record(any(), any(), any(), any(), any(), any(), anyMap());
	}
}
