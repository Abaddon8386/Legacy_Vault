package com.legacyvault.beneficiary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.repository.RoleRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.StaffCaseLockRepository;

/** BE-01: Staff creates an account that stays unlinked. */
class StaffAccountProvisioningServiceTest {

	private static final Long STAFF_ID = 7L;
	private static final UUID CASE_ID = UUID.randomUUID();

	private final StaffContextService staff = mock(StaffContextService.class);
	private final StaffCaseLockRepository caseLookup = mock(StaffCaseLockRepository.class);
	private final UserRepository users = mock(UserRepository.class);
	private final PasswordEncoder encoder = mock(PasswordEncoder.class);
	private final AuditService audit = mock(AuditService.class);
	private final RoleRepository roles = mock(RoleRepository.class);
	private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
	private final StaffAccountProvisioningService service = new StaffAccountProvisioningService(staff, caseLookup, users,
			encoder, audit, roles, userRoles);
	private final User actor = mock(User.class);
	private final VerificationCase ownedCase = mock(VerificationCase.class);

	StaffAccountProvisioningServiceTest() {
		Role ownerRole = mock(Role.class);
		when(ownerRole.getRoleId()).thenReturn(1L);
		when(ownerRole.getRoleCode()).thenReturn("ROLE_VAULT_OWNER");
		when(roles.findByRoleCode("ROLE_VAULT_OWNER")).thenReturn(Optional.of(ownerRole));
		when(actor.getUserId()).thenReturn(STAFF_ID);
		when(staff.requireStaff()).thenReturn(actor);
		when(ownedCase.isOpen()).thenReturn(true);
		when(ownedCase.getVaultId()).thenReturn(9L);
		when(caseLookup.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.of(ownedCase));
		when(encoder.encode("Counter-pass1")).thenReturn("$2a$hash");
		when(users.saveAndFlush(any(User.class))).thenAnswer(call -> {
			User saved = call.getArgument(0);
			org.springframework.test.util.ReflectionTestUtils.setField(saved, "userId", 55L);
			org.springframework.test.util.ReflectionTestUtils.setField(saved, "publicId", UUID.randomUUID());
			return saved;
		});
	}

	private BeneficiaryLinkRequestDtos.CreateAccountRequest body() {
		return new BeneficiaryLinkRequestDtos.CreateAccountRequest(" New@Example.com ", " Nguyen Van B ",
				"Counter-pass1", "0912345678");
	}

	@Test
	void createsAnActiveAccountWithHashedPasswordThatIsNotLinked() {
		var created = service.createUnlinked(CASE_ID, body());

		assertThat(created.linkStatus()).isEqualTo("UNLINKED");
		ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
		verify(users).saveAndFlush(saved.capture());
		assertThat(saved.getValue().getEmail()).isEqualTo("new@example.com");
		assertThat(saved.getValue().getPasswordHash()).isEqualTo("$2a$hash");
		assertThat(saved.getValue().getStatus()).isEqualTo("ACTIVE");
		ArgumentCaptor<UserRole> personalRole = ArgumentCaptor.forClass(UserRole.class);
        verify(userRoles).save(personalRole.capture());
        assertThat(personalRole.getValue().getRole().getRoleCode()).isEqualTo("ROLE_VAULT_OWNER");
        assertThat(personalRole.getValue().getUser()).isSameAs(saved.getValue());
        assertThat(personalRole.getValue().getAssignedByUserId()).isEqualTo(STAFF_ID);
        verify(roles, never()).findByRoleCode("ROLE_BENEFICIARY");
		verify(audit).record(eq(STAFF_ID), eq(9L), eq("BENEFICIARY_ACCOUNT_CREATED_UNLINKED"), eq("USER"), any(),
				eq("USER"), anyMap());
	}

	@Test
	void auditAndToStringNeverContainThePasswordOrEmail() {
		service.createUnlinked(CASE_ID, body());

		@SuppressWarnings("unchecked")
		ArgumentCaptor<java.util.Map<String, Object>> details = ArgumentCaptor.forClass(java.util.Map.class);
		verify(audit).record(any(), any(), any(), any(), any(), any(), details.capture());
		assertThat(details.getValue().toString()).doesNotContain("Counter-pass1", "example.com");
		assertThat(body().toString()).doesNotContain("Counter-pass1").contains("<redacted>");
	}

	@Test
	void existingEmailIsRejectedAndNeverReusedOrLinked() {
		when(users.existsByEmail("new@example.com")).thenReturn(true);

		BusinessException ex = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
				() -> service.createUnlinked(CASE_ID, body()));

		assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
		verify(users, never()).saveAndFlush(any());
	}

	@Test
	void raceOnTheEmailUniqueIndexAlsoReportsDuplicate() {
		when(users.saveAndFlush(any(User.class))).thenThrow(new DataIntegrityViolationException("dup"));

		BusinessException ex = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
				() -> service.createUnlinked(CASE_ID, body()));

		assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
	}

	@Test
	void staffWithoutTheOpenCaseCannotCreateAccounts() {
		when(caseLookup.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());

		BusinessException ex = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
				() -> service.createUnlinked(CASE_ID, body()));

		assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verify(users, never()).saveAndFlush(any());
	}
}
