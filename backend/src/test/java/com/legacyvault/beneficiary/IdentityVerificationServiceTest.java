package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.UserAccount;
import com.legacyvault.user.UserAccountRepository;
import com.legacyvault.vault.Vault;

class IdentityVerificationServiceTest {

	@AfterEach
	void clearSecurityContext() { SecurityContextHolder.clearContext(); }

	@Test
	void recordsStaffDecisionAndUpdatesCurrentBeneficiaryStatus() {
		UUID staffId = UUID.randomUUID();
		UUID beneficiaryId = UUID.randomUUID();
		UserAccount actor = mock(UserAccount.class);
		when(actor.getId()).thenReturn(7L);
		UserAccountRepository users = mock(UserAccountRepository.class);
		when(users.findByPublicIdAndDeletedAtIsNull(staffId)).thenReturn(Optional.of(actor));
		SecurityContextHolder.getContext().setAuthentication(
				new UsernamePasswordAuthenticationToken(staffId.toString(), "", java.util.List.of()));

		Beneficiary beneficiary = mock(Beneficiary.class);
		Vault vault = mock(Vault.class);
		when(beneficiary.getPublicId()).thenReturn(beneficiaryId);
		when(beneficiary.getVault()).thenReturn(vault);
		when(beneficiary.getId()).thenReturn(12L);
		when(vault.getId()).thenReturn(9L);
		BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
		when(beneficiaries.findByPublicId(beneficiaryId)).thenReturn(Optional.of(beneficiary));
		IdentityVerificationRepository records = mock(IdentityVerificationRepository.class);
		when(records.saveAndFlush(any(IdentityVerificationRecord.class)))
				.thenAnswer(invocation -> invocation.getArgument(0));
		AuditService audit = mock(AuditService.class);
		IdentityVerificationService service = new IdentityVerificationService(beneficiaries, records,
				new StaffContextService(users), audit);

		service.verify(beneficiaryId, new IdentityVerificationDtos.Request(IdentityVerificationDtos.DocumentType.CCCD,
				"Cong an", "1234", IdentityVerificationDtos.Result.NOT_MATCH));

		verify(beneficiary).recordIdentityVerification("NOT_MATCH");
		verify(beneficiaries).save(beneficiary);
		verify(records).saveAndFlush(any(IdentityVerificationRecord.class));
		verify(audit).record(eq(7L), eq(9L), eq("BENEFICIARY_IDENTITY_VERIFIED"), eq("BENEFICIARY"),
				eq(12L), eq("STAFF"), any());
	}
}
