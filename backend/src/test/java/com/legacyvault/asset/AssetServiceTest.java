package com.legacyvault.asset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.test.util.ReflectionTestUtils;

import com.legacyvault.asset.dto.AssetResponse;
import com.legacyvault.asset.dto.AssetSecretResponse;
import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.dto.UpdateAssetRequest;
import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.crypto.EncryptedData;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.service.VaultService;

/** PS-15 ở tầng service: ownership/trạng thái Vault, mã hóa payload, audit, danh sách bỏ DOCUMENT. */
class AssetServiceTest {

	private static final Long OWNER_ID = 1L;
	private static final Long VAULT_DB_ID = 10L;
	private static final UUID VAULT_ID = UUID.randomUUID();
	private static final String SECRET = "mat-khau-email-du-phong";

	private final AssetRepository assetRepository = mock(AssetRepository.class);
	private final VaultService vaultService = mock(VaultService.class);
	private final EncryptionService encryptionService = new EncryptionService(
			Base64.getEncoder().encodeToString(new byte[32]), "v1");
	private final AuditService auditService = mock(AuditService.class);
	private final PasswordReauthService reauthService = mock(PasswordReauthService.class);
	private final AssetService assetService = new AssetService(assetRepository, vaultService, encryptionService,
			auditService, reauthService, mock(com.legacyvault.subscription.service.OwnerQuotaService.class));

	private static Vault vault() {
		Vault vault = new Vault();
		vault.setOwnerUserId(OWNER_ID);
		vault.setName("Kho");
		vault.setDescription(null);
		ReflectionTestUtils.setField(vault, "vaultId", VAULT_DB_ID);
		ReflectionTestUtils.setField(vault, "publicId", VAULT_ID);
		ReflectionTestUtils.setField(vault, "status", "ACTIVE");
		return vault;
	}

	/** Mô phỏng DB: gán khóa và thời gian như khi INSERT. */
	private void repositoryAssignsIdOnSave() {
		when(assetRepository.save(any(Asset.class))).thenAnswer(inv -> {
			Asset asset = inv.getArgument(0);
			ReflectionTestUtils.setField(asset, "assetId", 100L);
			ReflectionTestUtils.setField(asset, "createdAt", LocalDateTime.of(2026, 10, 8, 10, 0));
			ReflectionTestUtils.setField(asset, "updatedAt", LocalDateTime.of(2026, 10, 8, 10, 0));
			return asset;
		});
	}

	@Test
	void create_encryptsPayload_savesAndAudits() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		repositoryAssignsIdOnSave();

		AssetResponse response = assetService.createAsset(VAULT_ID, OWNER_ID,
				new CreateAssetRequest("  Mật khẩu email  ", "CREDENTIAL", "   ", SECRET));

		ArgumentCaptor<Asset> saved = ArgumentCaptor.forClass(Asset.class);
		verify(assetRepository).save(saved.capture());
		Asset asset = saved.getValue();
		assertThat(asset.getVaultId()).isEqualTo(VAULT_DB_ID);
		assertThat(asset.getAssetType()).isEqualTo(AssetType.CREDENTIAL);
		assertThat(asset.getName()).isEqualTo("Mật khẩu email");
		assertThat(asset.getDescription()).isNull();

		// DB chỉ có ciphertext; giải mã lại (với đúng Asset) ra đúng payload gốc.
		byte[] ciphertext = (byte[]) ReflectionTestUtils.getField(asset, "encryptedPayload");
		byte[] iv = (byte[]) ReflectionTestUtils.getField(asset, "encryptionIv");
		assertThat(new String(ciphertext, StandardCharsets.UTF_8)).doesNotContain(SECRET);
		assertThat(encryptionService.decrypt(new EncryptedData(ciphertext, iv, "v1"),
				asset.getPublicId().toString().getBytes(StandardCharsets.UTF_8))).isEqualTo(SECRET);

		assertThat(response.id()).isEqualTo(asset.getPublicId());
		assertThat(response.vaultId()).isEqualTo(VAULT_ID);
		assertThat(response.hasPayload()).isTrue();

		ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
		verify(auditService).record(audit.capture());
		assertThat(audit.getValue().action()).isEqualTo(AuditAction.ASSET_CREATED);
		assertThat(audit.getValue().stepId()).isEqualTo("ST-02");
		assertThat(audit.getValue().actorUserId()).isEqualTo(OWNER_ID);
		assertThat(audit.getValue().vaultId()).isEqualTo(VAULT_DB_ID);
		assertThat(audit.getValue().entityId()).isEqualTo(100L);
		assertThat(audit.getValue().context()).containsEntry("assetType", "CREDENTIAL");
		assertThat(audit.getValue().context().toString()).doesNotContain(SECRET);
	}

	@Test
	void create_onVaultOfOtherUser_isNotFoundAndNothingSaved() {
		when(vaultService.requireEditableVault(VAULT_ID, 2L))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		assertThatThrownBy(() -> assetService.createAsset(VAULT_ID, 2L,
				new CreateAssetRequest("x", "TEXT", null, SECRET)))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verifyNoInteractions(assetRepository, auditService);
	}

	@Test
	void create_onFrozenVault_isRejectedAndNothingSaved() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID))
				.thenThrow(new BusinessException(ErrorCode.VAULT_NOT_EDITABLE));

		assertThatThrownBy(() -> assetService.createAsset(VAULT_ID, OWNER_ID,
				new CreateAssetRequest("x", "TEXT", null, SECRET)))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.VAULT_NOT_EDITABLE);
		verifyNoInteractions(assetRepository, auditService);
	}

	@Test
	void list_checksOwnershipAndExcludesWillDocuments() {
		when(vaultService.requireOwnedVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		Asset asset = new Asset(VAULT_DB_ID, AssetType.TEXT, "Ghi chú", null);
		ReflectionTestUtils.setField(asset, "createdAt", LocalDateTime.of(2026, 10, 8, 10, 0));
		ReflectionTestUtils.setField(asset, "updatedAt", LocalDateTime.of(2026, 10, 8, 10, 0));
		when(assetRepository.findByVaultIdAndAssetTypeNot(eq(VAULT_DB_ID), eq(AssetType.DOCUMENT), any()))
				.thenAnswer(inv -> new PageImpl<>(List.of(asset), inv.getArgument(2), 1));

		PageResponse<AssetResponse> page = assetService.listAssets(VAULT_ID, OWNER_ID, 0, 20);

		ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
		verify(assetRepository).findByVaultIdAndAssetTypeNot(eq(VAULT_DB_ID), eq(AssetType.DOCUMENT),
				pageable.capture());
		assertThat(pageable.getValue().getSort()).isEqualTo(Sort.by(Sort.Direction.DESC, "createdAt"));
		assertThat(page.content()).extracting(AssetResponse::name).containsExactly("Ghi chú");
		assertThat(page.content().get(0).vaultId()).isEqualTo(VAULT_ID);
		assertThat(page.content().get(0).hasPayload()).isFalse();
	}

	@Test
	void list_onVaultOfOtherUser_isNotFound() {
		when(vaultService.requireOwnedVault(VAULT_ID, 2L))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		assertThatThrownBy(() -> assetService.listAssets(VAULT_ID, 2L, 0, 20))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verifyNoInteractions(assetRepository);
	}

	// ---------- PS-16: xem chi tiết / cập nhật ----------

	private static Asset storedAsset() {
		Asset asset = new Asset(VAULT_DB_ID, AssetType.CREDENTIAL, "Email", "Ghi chú cũ");
		ReflectionTestUtils.setField(asset, "assetId", 100L);
		ReflectionTestUtils.setField(asset, "createdAt", LocalDateTime.of(2026, 10, 8, 10, 0));
		ReflectionTestUtils.setField(asset, "updatedAt", LocalDateTime.of(2026, 10, 8, 10, 0));
		return asset;
	}

	private void ownerFinds(Asset asset) {
		when(assetRepository.findByPublicIdAndVaultIdAndAssetTypeNot(asset.getPublicId(), VAULT_DB_ID,
				AssetType.DOCUMENT)).thenReturn(Optional.of(asset));
	}

	@Test
	void get_findsAssetOnlyInsideOwnedVault_excludingWills() {
		Asset asset = storedAsset();
		when(vaultService.requireOwnedVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		ownerFinds(asset);

		AssetResponse response = assetService.getAsset(VAULT_ID, asset.getPublicId(), OWNER_ID);

		assertThat(response.id()).isEqualTo(asset.getPublicId());
		assertThat(response.name()).isEqualTo("Email");
	}

	@Test
	void get_assetOfAnotherVaultOrMissing_isNotFound() {
		UUID other = UUID.randomUUID();
		when(vaultService.requireOwnedVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		when(assetRepository.findByPublicIdAndVaultIdAndAssetTypeNot(other, VAULT_DB_ID, AssetType.DOCUMENT))
				.thenReturn(Optional.empty());

		assertThatThrownBy(() -> assetService.getAsset(VAULT_ID, other, OWNER_ID))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
	}

	@Test
	void update_changesOnlyGivenFields_reencryptsPayload_andAuditsFieldNamesOnly() {
		Asset asset = storedAsset();
		byte[] oldIv = new byte[12];
		asset.setEncryptedPayload(new EncryptedData(new byte[] { 1 }, oldIv, "v1"));
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		ownerFinds(asset);
		when(assetRepository.saveAndFlush(asset)).thenReturn(asset);

		assetService.updateAsset(VAULT_ID, asset.getPublicId(), OWNER_ID, new UpdateAssetRequest(null, null, SECRET));

		assertThat(asset.getName()).isEqualTo("Email");
		assertThat(asset.getDescription()).isEqualTo("Ghi chú cũ");
		assertThat(asset.getAssetType()).isEqualTo(AssetType.CREDENTIAL);
		byte[] ciphertext = (byte[]) ReflectionTestUtils.getField(asset, "encryptedPayload");
		byte[] iv = (byte[]) ReflectionTestUtils.getField(asset, "encryptionIv");
		assertThat(iv).isNotEqualTo(oldIv);
		assertThat(encryptionService.decrypt(new EncryptedData(ciphertext, iv, "v1"),
				asset.getPublicId().toString().getBytes(StandardCharsets.UTF_8))).isEqualTo(SECRET);

		ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
		verify(auditService).record(audit.capture());
		assertThat(audit.getValue().action()).isEqualTo(AuditAction.ASSET_UPDATED);
		assertThat(audit.getValue().stepId()).isEqualTo("ST-02");
		assertThat(audit.getValue().context()).containsEntry("changedFields", List.of("payload"));
		assertThat(audit.getValue().context().toString()).doesNotContain(SECRET);
	}

	@Test
	void update_nameAndClearDescription() {
		Asset asset = storedAsset();
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		ownerFinds(asset);
		when(assetRepository.saveAndFlush(asset)).thenReturn(asset);

		assetService.updateAsset(VAULT_ID, asset.getPublicId(), OWNER_ID,
				new UpdateAssetRequest("  Email mới ", "", null));

		assertThat(asset.getName()).isEqualTo("Email mới");
		assertThat(asset.getDescription()).isNull();
		assertThat(asset.hasPayload()).isFalse();
		ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
		verify(auditService).record(audit.capture());
		assertThat(audit.getValue().context()).containsEntry("changedFields", List.of("name", "description"));
	}

	@Test
	void update_withSameValues_writesNothingAndDoesNotAudit() {
		Asset asset = storedAsset();
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		ownerFinds(asset);

		AssetResponse response = assetService.updateAsset(VAULT_ID, asset.getPublicId(), OWNER_ID,
				new UpdateAssetRequest("Email", "Ghi chú cũ", null));

		assertThat(response.name()).isEqualTo("Email");
		verify(assetRepository, never()).saveAndFlush(any());
		verifyNoInteractions(auditService);
	}

	@Test
	void update_onFrozenVault_isRejectedBeforeTouchingAsset() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID))
				.thenThrow(new BusinessException(ErrorCode.VAULT_NOT_EDITABLE));

		assertThatThrownBy(() -> assetService.updateAsset(VAULT_ID, UUID.randomUUID(), OWNER_ID,
				new UpdateAssetRequest("x", null, null)))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.VAULT_NOT_EDITABLE);
		verifyNoInteractions(assetRepository, auditService);
	}

	// ---------- PS-16: xem nội dung bảo mật sau khi nhập lại mật khẩu (D-API-32) ----------

	/** Asset đã có payload mã hóa đúng như createAsset tạo ra. */
	private Asset storedAssetWithPayload(String payload) {
		Asset asset = storedAsset();
		asset.setEncryptedPayload(encryptionService.encrypt(payload, asset.getPublicId().toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
		return asset;
	}

	@Test
	void reveal_returnsDecryptedPayload_afterPasswordCheck_andAuditsWithoutContent() {
		Asset asset = storedAssetWithPayload(SECRET);
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		ownerFinds(asset);

		AssetSecretResponse response = assetService.revealAsset(VAULT_ID, asset.getPublicId(), OWNER_ID, "MatKhau@123");

		assertThat(response.id()).isEqualTo(asset.getPublicId());
		assertThat(response.payload()).isEqualTo(SECRET);
		verify(reauthService).requirePassword(OWNER_ID, VAULT_DB_ID, "MatKhau@123");

		ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
		verify(auditService).record(audit.capture());
		assertThat(audit.getValue().action()).isEqualTo(AuditAction.ASSET_REVEALED);
		assertThat(audit.getValue().stepId()).isEqualTo("ST-02");
		assertThat(audit.getValue().actorUserId()).isEqualTo(OWNER_ID);
		assertThat(audit.getValue().context().toString()).doesNotContain(SECRET).doesNotContain("MatKhau@123");
		assertThat(response.toString()).doesNotContain(SECRET);
	}

	@Test
	void reveal_withWrongPassword_neverDecryptsOrAudits() {
		Asset asset = storedAssetWithPayload(SECRET);
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		ownerFinds(asset);
		doThrow(new BusinessException(ErrorCode.REAUTH_FAILED)).when(reauthService)
				.requirePassword(OWNER_ID, VAULT_DB_ID, "sai");

		assertThatThrownBy(() -> assetService.revealAsset(VAULT_ID, asset.getPublicId(), OWNER_ID, "sai"))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.REAUTH_FAILED);
		verifyNoInteractions(auditService);
	}

	@Test
	void reveal_onOtherUsersVault_isNotFound_andPasswordIsNeverChecked() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		assertThatThrownBy(() -> assetService.revealAsset(VAULT_ID, UUID.randomUUID(), OWNER_ID, "x"))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verifyNoInteractions(reauthService, assetRepository, auditService);
	}

	@Test
	void reveal_onFrozenVault_isRejectedBeforePasswordCheck() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID))
				.thenThrow(new BusinessException(ErrorCode.VAULT_NOT_EDITABLE));

		assertThatThrownBy(() -> assetService.revealAsset(VAULT_ID, UUID.randomUUID(), OWNER_ID, "x"))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.VAULT_NOT_EDITABLE);
		verifyNoInteractions(reauthService, assetRepository, auditService);
	}

	@Test
	void reveal_assetWithoutPayload_isNotFound() {
		Asset asset = storedAsset();
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		ownerFinds(asset);

		assertThatThrownBy(() -> assetService.revealAsset(VAULT_ID, asset.getPublicId(), OWNER_ID, "MatKhau@123"))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verifyNoInteractions(auditService);
	}
}
