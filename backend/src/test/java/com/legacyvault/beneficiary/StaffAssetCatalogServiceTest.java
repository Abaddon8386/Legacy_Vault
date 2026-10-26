package com.legacyvault.beneficiary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;

class StaffAssetCatalogServiceTest {
	private static final UUID CASE_ID = UUID.randomUUID();
	private static final Long STAFF_ID = 8L;
	private static final Long VAULT_ID = 12L;
	private final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
	private final VaultRepository vaults = mock(VaultRepository.class);
	private final StaffVaultCaseGuard guard = mock(StaffVaultCaseGuard.class);
	private final AssetRepository assets = mock(AssetRepository.class);
	private final StaffContextService staff = mock(StaffContextService.class);
	private final StaffAssetCatalogService service = new StaffAssetCatalogService(cases, vaults, guard, assets, staff);
	private final VerificationCase verificationCase = mock(VerificationCase.class);
	private final Vault vault = mock(Vault.class);
	private final User actor = mock(User.class);

	@BeforeEach
	void setup() {
		when(actor.getUserId()).thenReturn(STAFF_ID);
		when(staff.requireStaff()).thenReturn(actor);
		when(verificationCase.getVaultId()).thenReturn(VAULT_ID);
		when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.of(verificationCase));
		when(vaults.findById(VAULT_ID)).thenReturn(Optional.of(vault));
		when(vault.getVaultId()).thenReturn(VAULT_ID);
		when(vault.getStatus()).thenReturn(Vault.STATUS_LEGAL_BASIS_VERIFICATION);
	}

	@Test
	void assignedStaffReadsPagedSafeMetadataAndActiveNonWillAssets() {
		UUID publicId = UUID.randomUUID();
		Asset asset = mock(Asset.class);
		when(asset.getPublicId()).thenReturn(publicId);
		when(asset.getAssetType()).thenReturn(AssetType.CREDENTIAL);
		when(asset.getName()).thenReturn("Bank login");
		when(assets.findByVaultIdAndStatusAndAssetTypeNot(eq(VAULT_ID), eq("ACTIVE"), eq(AssetType.DOCUMENT), any()))
				.thenReturn(new PageImpl<>(List.of(asset)));

		var page = service.list(CASE_ID, 0, 20);

		assertThat(page.content()).containsExactly(new StaffAssetCatalogDtos.Item(publicId, "CREDENTIAL", "Bank login"));
		assertThat(page.totalElements()).isEqualTo(1);
		verify(guard).requireOpenForRead(VAULT_ID, STAFF_ID);
		verify(assets).findByVaultIdAndStatusAndAssetTypeNot(eq(VAULT_ID), eq("ACTIVE"), eq(AssetType.DOCUMENT), any());
		var fields = java.util.Arrays.stream(StaffAssetCatalogDtos.Item.class.getRecordComponents())
				.map(java.lang.reflect.RecordComponent::getName).toList();
		assertThat(fields).containsExactly("assetId", "assetType", "name");
	}

	@Test
	void emptyCatalogIsValid() {
		when(assets.findByVaultIdAndStatusAndAssetTypeNot(eq(VAULT_ID), eq("ACTIVE"), eq(AssetType.DOCUMENT), any()))
				.thenReturn(new PageImpl<>(List.of()));
		assertThat(service.list(CASE_ID, 0, 20).content()).isEmpty();
	}

	@Test
	void unassignedOrCrossCaseStaffCannotReadAndDoesNotQueryAssets() {
		when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());
		assertThat(codeOf(() -> service.list(CASE_ID, 0, 20))).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verifyNoInteractions(guard, vaults, assets);
	}

	@Test
	void closedCaseRejectedBySharedGuardBeforeAssetQuery() {
		doThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND)).when(guard).requireOpenForRead(VAULT_ID, STAFF_ID);
		assertThat(codeOf(() -> service.list(CASE_ID, 0, 20))).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verifyNoInteractions(vaults, assets);
	}

	@Test
	void aStaffRoleWithoutAnAuthenticatedStaffPrincipalCannotRead() {
		when(staff.requireStaff()).thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));
		assertThat(codeOf(() -> service.list(CASE_ID, 0, 20))).isEqualTo(ErrorCode.ACCESS_DENIED);
		verifyNoInteractions(cases, guard, vaults, assets);
	}

	@Test
	void onlyDocumentedPreUnlockVaultStatesAreReadable() {
		assertThat(List.of(Vault.STATUS_AWAITING_VERIFICATION, Vault.STATUS_DOCUMENT_VERIFICATION,
				Vault.STATUS_WILL_VERIFICATION, Vault.STATUS_AWAITING_LEGAL_BASIS,
				Vault.STATUS_LEGAL_BASIS_VERIFICATION)).allMatch(StaffAssetCatalogService::isPreUnlockStatus);
		assertThat(List.of(Vault.STATUS_ACTIVE, Vault.STATUS_ON_HOLD, Vault.STATUS_UNLOCKED,
				Vault.STATUS_HANDOVER_IN_PROGRESS, Vault.STATUS_ARCHIVED, "UNKNOWN"))
				.noneMatch(StaffAssetCatalogService::isPreUnlockStatus);
	}

	@Test
	void holdAndArchivedStatusesAreRejectedBeforeAssetQuery() {
		for (String status : List.of(Vault.STATUS_ON_HOLD, Vault.STATUS_ARCHIVED, Vault.STATUS_ACTIVE)) {
			when(vault.getStatus()).thenReturn(status);
			assertThat(codeOf(() -> service.list(CASE_ID, 0, 20))).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		}
		verifyNoInteractions(assets);
	}

	@Test
	void assignedStaffCanReadMetadataDuringUnlockedHandover() {
		when(assets.findByVaultIdAndStatusAndAssetTypeNot(eq(VAULT_ID), eq("ACTIVE"), eq(AssetType.DOCUMENT), any()))
				.thenReturn(new PageImpl<>(List.of()));
		for (String status : List.of(Vault.STATUS_UNLOCKED, Vault.STATUS_HANDOVER_IN_PROGRESS)) {
			when(vault.getStatus()).thenReturn(status);
			assertThat(service.list(CASE_ID, 0, 20).content()).isEmpty();
		}
	}

	private static ErrorCode codeOf(Runnable action) {
		try { action.run(); } catch (BusinessException ex) { return ex.getErrorCode(); }
		throw new AssertionError("BusinessException expected");
	}
}
