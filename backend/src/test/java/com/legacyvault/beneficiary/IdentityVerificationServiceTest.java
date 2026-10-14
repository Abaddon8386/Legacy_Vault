package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;

class IdentityVerificationServiceTest {

	@AfterEach
	void clearSecurityContext() { SecurityContextHolder.clearContext(); }

	@Test
	void recordsStaffDecisionAndUpdatesCurrentBeneficiaryStatus() {
		UUID staffId = UUID.randomUUID();
		UUID beneficiaryId = UUID.randomUUID();
		User actor = mock(User.class);
		when(actor.getUserId()).thenReturn(7L);
		when(actor.getPublicId()).thenReturn(staffId);
		when(actor.getFullName()).thenReturn("Staff Examiner");
		when(actor.getStatus()).thenReturn("ACTIVE");
		UserRepository users = mock(UserRepository.class);
		when(users.findByPublicId(staffId)).thenReturn(Optional.of(actor));
		SecurityContextHolder.getContext().setAuthentication(
				new UsernamePasswordAuthenticationToken(new CustomUserPrincipal(7L, staffId, "staff@example.com"),
						"", java.util.List.of()));

		Beneficiary beneficiary = mock(Beneficiary.class);
		Vault vault = mock(Vault.class);
		when(beneficiary.getPublicId()).thenReturn(beneficiaryId);
		when(beneficiary.getVault()).thenReturn(vault);
		when(beneficiary.getId()).thenReturn(12L);
		when(vault.getVaultId()).thenReturn(9L);
		BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
		when(beneficiaries.findByPublicId(beneficiaryId)).thenReturn(Optional.of(beneficiary));
		IdentityVerificationRepository records = mock(IdentityVerificationRepository.class);
		when(records.saveAndFlush(any(IdentityVerificationRecord.class)))
				.thenAnswer(invocation -> invocation.getArgument(0));
		AuditService audit = mock(AuditService.class);
		IdentityVerificationService service = new IdentityVerificationService(beneficiaries, records,
				new StaffContextService(users), users, audit);

		var response = service.verify(beneficiaryId, new IdentityVerificationDtos.Request(IdentityVerificationDtos.DocumentType.CCCD,
				"Cong an", "1234", IdentityVerificationDtos.Result.NOT_MATCH));
		assertEquals(staffId, response.verifiedBy().id());
		assertEquals("Staff Examiner", response.verifiedBy().fullName());

		verify(beneficiary).recordIdentityVerification("NOT_MATCH");
		verify(beneficiaries).save(beneficiary);
		verify(records).saveAndFlush(any(IdentityVerificationRecord.class));
		verify(audit).record(eq(7L), eq(9L), eq("BENEFICIARY_IDENTITY_VERIFIED"), eq("BENEFICIARY"),
				eq(12L), eq("USER"), any());
	}

	@Test
	void historyReturnsTheRecordedStaffIdentity() {
		UUID staffId = UUID.randomUUID();
		UUID beneficiaryId = UUID.randomUUID();
		User actor = mock(User.class);
		when(actor.getUserId()).thenReturn(7L);
		when(actor.getPublicId()).thenReturn(staffId);
		when(actor.getFullName()).thenReturn("Staff Examiner");
		UserRepository users = mock(UserRepository.class);
		when(users.findAllById(List.of(7L))).thenReturn(List.of(actor));
		Beneficiary beneficiary = mock(Beneficiary.class);
		when(beneficiary.getPublicId()).thenReturn(beneficiaryId);
		BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
		when(beneficiaries.existsByPublicId(beneficiaryId)).thenReturn(true);
		IdentityVerificationRecord record = mock(IdentityVerificationRecord.class);
		when(record.getActorUserId()).thenReturn(7L);
		when(record.getBeneficiary()).thenReturn(beneficiary);
		when(record.getDocumentType()).thenReturn("CCCD");
		when(record.getResult()).thenReturn("MATCH");
		IdentityVerificationRepository records = mock(IdentityVerificationRepository.class);
		when(records.findAllByBeneficiary_PublicIdOrderByVerifiedAtDesc(beneficiaryId))
				.thenReturn(List.of(record));
		var service = new IdentityVerificationService(beneficiaries, records,
				mock(StaffContextService.class), users, mock(AuditService.class));

		var history = service.history(beneficiaryId);
		assertEquals(staffId, history.get(0).verifiedBy().id());
		assertEquals("Staff Examiner", history.get(0).verifiedBy().fullName());
	}
}
