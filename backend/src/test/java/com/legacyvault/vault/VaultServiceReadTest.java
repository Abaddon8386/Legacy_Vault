package com.legacyvault.vault;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.legacyvault.dms.DmsConfigRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.test.util.ReflectionTestUtils;

import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.vault.dto.VaultResponse;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.vault.service.VaultService;

/** PS-14: ownership ở tầng service — luôn truy vấn theo cặp (vaultId, ownerUserId). */
class VaultServiceReadTest {

	private static final Long OWNER_ID = 1L;
	private static final Long STRANGER_ID = 2L;
	private static final UUID VAULT_ID = UUID.randomUUID();
	private static final CustomUserPrincipal OWNER = new CustomUserPrincipal(OWNER_ID, UUID.randomUUID(),
			"owner@example.com");
	private static final CustomUserPrincipal STRANGER = new CustomUserPrincipal(STRANGER_ID, UUID.randomUUID(),
			"stranger@example.com");

	private final VaultRepository vaultRepository = mock(VaultRepository.class);
	private final AuditService auditService = mock(AuditService.class);
	private final DmsConfigRepository dmsConfigRepository = mock(DmsConfigRepository.class);
	private final VerificationCaseRepository verificationCaseRepository = mock(VerificationCaseRepository.class);
	private final VaultService vaultService = new VaultService(vaultRepository, auditService, dmsConfigRepository, verificationCaseRepository,
			mock(com.legacyvault.user.repository.OwnerWriteLockRepository.class));

	private static Vault storedVault(String status) {
		Vault vault = new Vault();
		vault.setOwnerUserId(OWNER_ID);
		vault.setName("Kho di sản gia đình");
		vault.setDescription("Tài sản số");
		ReflectionTestUtils.setField(vault, "vaultId", 10L);
		ReflectionTestUtils.setField(vault, "publicId", VAULT_ID);
		ReflectionTestUtils.setField(vault, "status", status);
		ReflectionTestUtils.setField(vault, "createdAt", Instant.parse("2026-10-08T10:00:00Z"));
		ReflectionTestUtils.setField(vault, "updatedAt", Instant.parse("2026-10-08T11:00:00Z"));
		return vault;
	}

	@Test
	void owner_getsOwnVault() {
		when(vaultRepository.findByPublicIdAndOwnerUserId(VAULT_ID, OWNER_ID))
				.thenReturn(Optional.of(storedVault("ACTIVE")));

		VaultResponse response = vaultService.getVault(VAULT_ID, OWNER);

		assertThat(response.id()).isEqualTo(VAULT_ID);
		assertThat(response.name()).isEqualTo("Kho di sản gia đình");
		assertThat(response.status()).isEqualTo("ACTIVE");
		assertThat(response.createdAt()).isEqualTo(Instant.parse("2026-10-08T10:00:00Z"));
	}

	@Test
	void otherUser_getsNotFound_andLookupIsByOwnerPair() {
		when(vaultRepository.findByPublicIdAndOwnerUserId(VAULT_ID, STRANGER_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> vaultService.getVault(VAULT_ID, STRANGER))
				.isInstanceOf(BusinessException.class)
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);

		// Không được tìm theo id rồi mới so chủ sở hữu.
		verify(vaultRepository).findByPublicIdAndOwnerUserId(VAULT_ID, STRANGER_ID);
		verify(vaultRepository, never()).findByPublicId(any());
		verify(vaultRepository, never()).findById(any());
	}

	@Test
	void missingVault_getsSameNotFoundAsOtherUsersVault() {
		UUID missing = UUID.randomUUID();
		when(vaultRepository.findByPublicIdAndOwnerUserId(missing, OWNER_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> vaultService.requireOwnedVault(missing, OWNER_ID))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
	}

	@Test
	void principalNotFromJwtFilter_isUnauthenticated() {
		assertThatThrownBy(() -> vaultService.getVault(VAULT_ID, null))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.UNAUTHENTICATED);
		assertThatThrownBy(() -> vaultService.listVaults(null, 0, 20))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.UNAUTHENTICATED);
		verifyNoInteractions(vaultRepository);
	}

	@Test
	void list_queriesOnlyOwnersVaults_newestFirst() {
		when(vaultRepository.findByOwnerUserId(any(), any()))
				.thenAnswer(inv -> new PageImpl<>(List.of(storedVault("ACTIVE")), inv.getArgument(1), 1));

		PageResponse<VaultResponse> page = vaultService.listVaults(OWNER, 0, 20);

		ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
		verify(vaultRepository).findByOwnerUserId(eq(OWNER_ID), pageable.capture());
		assertThat(pageable.getValue().getPageNumber()).isZero();
		assertThat(pageable.getValue().getPageSize()).isEqualTo(20);
		assertThat(pageable.getValue().getSort()).isEqualTo(Sort.by(Sort.Direction.DESC, "createdAt"));
		assertThat(page.content()).extracting(VaultResponse::id).containsExactly(VAULT_ID);
		assertThat(page.totalElements()).isEqualTo(1);
	}

	@Test
	void editableVault_isReturnedOnlyWhenActive() {
		when(vaultRepository.findByPublicIdAndOwnerUserId(VAULT_ID, OWNER_ID))
				.thenReturn(Optional.of(storedVault("ACTIVE")));

		assertThat(vaultService.requireEditableVault(VAULT_ID, OWNER_ID).getPublicId()).isEqualTo(VAULT_ID);
	}

	@Test
	void vaultAfterGracePeriod_isNotEditable() {
		for (String status : List.of("AWAITING_VERIFICATION", "DOCUMENT_VERIFICATION", "UNLOCKED", "ARCHIVED")) {
			when(vaultRepository.findByPublicIdAndOwnerUserId(VAULT_ID, OWNER_ID))
					.thenReturn(Optional.of(storedVault(status)));

			assertThatThrownBy(() -> vaultService.requireEditableVault(VAULT_ID, OWNER_ID))
					.extracting(ex -> ((BusinessException) ex).getErrorCode())
					.isEqualTo(ErrorCode.VAULT_NOT_EDITABLE);
		}
	}

	@Test
	void editableCheck_onOtherUsersVault_isNotFoundBeforeStatusCheck() {
		when(vaultRepository.findByPublicIdAndOwnerUserId(VAULT_ID, STRANGER_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> vaultService.requireEditableVault(VAULT_ID, STRANGER_ID))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
	}
}
