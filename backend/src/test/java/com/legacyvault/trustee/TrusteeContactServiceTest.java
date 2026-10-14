package com.legacyvault.trustee;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

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

class TrusteeContactServiceTest {

	@AfterEach
	void clearSecurityContext() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void recordsExplicitOutcomeAndFallbackWithoutPuttingNoteInAudit() {
		UUID actorPublicId = UUID.randomUUID();
		UUID trusteePublicId = UUID.randomUUID();
		User actor = mock(User.class);
		when(actor.getUserId()).thenReturn(17L);
		when(actor.getStatus()).thenReturn("ACTIVE");
		UserRepository users = mock(UserRepository.class);
		when(users.findByPublicId(actorPublicId)).thenReturn(Optional.of(actor));
		SecurityContextHolder.getContext().setAuthentication(
				new UsernamePasswordAuthenticationToken(new CustomUserPrincipal(17L, actorPublicId, "staff@example.com"),
						"", java.util.List.of()));

		Trustee trustee = mock(Trustee.class);
		Vault vault = mock(Vault.class);
		when(trustee.getVault()).thenReturn(vault);
		when(trustee.getPublicId()).thenReturn(trusteePublicId);
		when(vault.getVaultId()).thenReturn(23L);
		TrusteeRepository trustees = mock(TrusteeRepository.class);
		when(trustees.findByPublicId(trusteePublicId)).thenReturn(Optional.of(trustee));
		TrusteeContactRecordRepository records = mock(TrusteeContactRecordRepository.class);
		when(records.saveAndFlush(any(TrusteeContactRecord.class)))
				.thenAnswer(invocation -> invocation.getArgument(0));
		AuditService audit = mock(AuditService.class);
		TrusteeContactService service = new TrusteeContactService(trustees, records,
				new StaffContextService(users), audit);

		service.record(trusteePublicId, new TrusteeContactDtos.RecordRequest(TrusteeContactDtos.Channel.PHONE,
				TrusteeContactDtos.Outcome.NO_RESPONSE, TrusteeContactDtos.FallbackStatus.REQUIRED,
				"  Called twice  "));

		var recordCaptor = org.mockito.ArgumentCaptor.forClass(TrusteeContactRecord.class);
		verify(records).saveAndFlush(recordCaptor.capture());
		assertEquals("Called twice", recordCaptor.getValue().getNote());
		assertEquals("NO_RESPONSE", recordCaptor.getValue().getOutcome());
		assertEquals("REQUIRED", recordCaptor.getValue().getFallbackStatus());
		var auditContext = org.mockito.ArgumentCaptor.forClass(Map.class);
		verify(audit).record(eq(17L), eq(23L), eq("TRUSTEE_CONTACT_RECORDED"), eq("TRUSTEE_CONTACT"),
				any(), eq("USER"), auditContext.capture());
		assertNull(auditContext.getValue().get("note"));
	}
}
