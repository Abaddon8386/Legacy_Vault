package com.legacyvault.will;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.crypto.EncryptedData;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.service.VaultService;
import com.legacyvault.will.dto.WillResponse;
import com.legacyvault.will.dto.WillVersionResponse;
import com.legacyvault.will.entity.AssetVersion;
import com.legacyvault.will.entity.LegalDocument;
import com.legacyvault.will.repository.AssetVersionRepository;
import com.legacyvault.will.repository.LegalDocumentRepository;
import com.legacyvault.will.repository.WillAssetRepository;
import com.legacyvault.will.repository.WillVersionView;
import com.legacyvault.will.service.WillService;

/** PS-17/PS-18 ở tầng service: UPLOADED không phải LEGAL_APPROVED, version + SHA-256, mã hóa, audit, ownership. */
class WillServiceTest {

	private static final Long OWNER_ID = 1L;
	private static final Long VAULT_DB_ID = 10L;
	private static final Long WILL_DB_ID = 100L;
	private static final UUID VAULT_ID = UUID.randomUUID();
	private static final byte[] PDF_V1 = "%PDF-1.7\nban scan di chuc v1".getBytes(StandardCharsets.US_ASCII);
	private static final byte[] PDF_V2 = "%PDF-1.7\nban scan di chuc v2".getBytes(StandardCharsets.US_ASCII);

	private final WillAssetRepository willAssetRepository = mock(WillAssetRepository.class);
	private final AssetVersionRepository versionRepository = mock(AssetVersionRepository.class);
	private final LegalDocumentRepository legalDocumentRepository = mock(LegalDocumentRepository.class);
	private final VaultService vaultService = mock(VaultService.class);
	private final EncryptionService encryptionService = new EncryptionService(
			Base64.getEncoder().encodeToString(new byte[32]), "v1");
	private final AuditService auditService = mock(AuditService.class);
	private final WillService willService = new WillService(willAssetRepository, versionRepository,
			legalDocumentRepository, vaultService, encryptionService, auditService, 10_485_760);

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

	private static Asset storedWill() {
		Asset will = new Asset(VAULT_DB_ID, AssetType.DOCUMENT, "di-chuc.pdf", null);
		ReflectionTestUtils.setField(will, "assetId", WILL_DB_ID);
		ReflectionTestUtils.setField(will, "createdAt", LocalDateTime.of(2026, 10, 8, 10, 0));
		ReflectionTestUtils.setField(will, "updatedAt", LocalDateTime.of(2026, 10, 8, 10, 0));
		return will;
	}

	private static MockMultipartFile pdf(byte[] content) {
		return new MockMultipartFile("file", "C:\\scan\\di-chuc.pdf", "application/pdf", content);
	}

	@BeforeEach
	void repositoriesBehaveLikeDb() {
		when(willAssetRepository.save(any(Asset.class))).thenAnswer(inv -> {
			Asset asset = inv.getArgument(0);
			ReflectionTestUtils.setField(asset, "assetId", WILL_DB_ID);
			ReflectionTestUtils.setField(asset, "createdAt", LocalDateTime.of(2026, 10, 8, 10, 0));
			ReflectionTestUtils.setField(asset, "updatedAt", LocalDateTime.of(2026, 10, 8, 10, 0));
			return asset;
		});
		when(legalDocumentRepository.save(any(LegalDocument.class))).thenAnswer(inv -> inv.getArgument(0));
		when(versionRepository.save(any(AssetVersion.class))).thenAnswer(inv -> {
			AssetVersion version = inv.getArgument(0);
			ReflectionTestUtils.setField(version, "uploadedAt", LocalDateTime.of(2026, 10, 8, 10, 0));
			return version;
		});
	}

	// ---------- PS-17: upload ----------

	@Test
	void upload_createsWillWithVersion1_statusUploaded_neverLegalApproved() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());

		WillResponse response = willService.uploadWill(VAULT_ID, OWNER_ID, pdf(PDF_V1), "  Bản scan  ");

		ArgumentCaptor<Asset> asset = ArgumentCaptor.forClass(Asset.class);
		verify(willAssetRepository).save(asset.capture());
		assertThat(asset.getValue().getAssetType()).isEqualTo(AssetType.DOCUMENT);
		assertThat(asset.getValue().getVaultId()).isEqualTo(VAULT_DB_ID);
		assertThat(asset.getValue().getDescription()).isEqualTo("Bản scan");
		assertThat(asset.getValue().hasPayload()).isFalse();

		ArgumentCaptor<LegalDocument> document = ArgumentCaptor.forClass(LegalDocument.class);
		verify(legalDocumentRepository).save(document.capture());
		assertThat(document.getValue().getDocumentType()).isEqualTo("WILL");
		assertThat(document.getValue().getAssetId()).isEqualTo(WILL_DB_ID);
		assertThat(document.getValue().getVerificationStatus()).isEqualTo("PENDING_VERIFICATION")
				.isNotEqualTo("LEGAL_APPROVED");

		assertThat(response.status()).isEqualTo("UPLOADED");
		assertThat(response.vaultId()).isEqualTo(VAULT_ID);
		WillVersionResponse v1 = response.currentVersion();
		assertThat(v1.version()).isEqualTo(1);
		assertThat(v1.fileName()).isEqualTo("di-chuc.pdf");
		assertThat(v1.contentType()).isEqualTo("application/pdf");
		assertThat(v1.sizeBytes()).isEqualTo(PDF_V1.length);
		assertThat(v1.sha256()).hasSize(64).matches("[0-9a-f]+");
	}

	@Test
	void upload_storesOnlyEncryptedContent_boundToItsVersion() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());

		willService.uploadWill(VAULT_ID, OWNER_ID, pdf(PDF_V1), null);

		ArgumentCaptor<AssetVersion> saved = ArgumentCaptor.forClass(AssetVersion.class);
		verify(versionRepository).save(saved.capture());
		AssetVersion version = saved.getValue();
		byte[] ciphertext = (byte[]) ReflectionTestUtils.getField(version, "encryptedFileContent");
		byte[] iv = (byte[]) ReflectionTestUtils.getField(version, "encryptionIv");
		assertThat(new String(ciphertext, StandardCharsets.US_ASCII)).doesNotContain("ban scan di chuc");
		assertThat(encryptionService.decryptBytes(new EncryptedData(ciphertext, iv, "v1"),
				version.getPublicId().toString().getBytes(StandardCharsets.UTF_8))).isEqualTo(PDF_V1);
		assertThat(version.getUploadStatus()).isEqualTo("UPLOADED");
	}

	@Test
	void upload_auditsIntegrityMetadataOnly() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());

		WillResponse response = willService.uploadWill(VAULT_ID, OWNER_ID, pdf(PDF_V1), "ghi chú riêng tư");

		ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
		verify(auditService).record(audit.capture());
		AuditEvent event = audit.getValue();
		assertThat(event.action()).isEqualTo(AuditAction.WILL_UPLOADED);
		assertThat(event.stepId()).isEqualTo("ST-03");
		assertThat(event.ruleId()).isEqualTo("LV-WILL-001");
		assertThat(event.entityType()).isEqualTo("WILL");
		assertThat(event.entityId()).isEqualTo(WILL_DB_ID);
		assertThat(event.context()).containsEntry("version", 1)
				.containsEntry("sha256", response.currentVersion().sha256())
				.containsEntry("sizeBytes", (long) PDF_V1.length);
		assertThat(event.context().toString()).doesNotContain("ban scan", "di-chuc.pdf", "ghi chú riêng tư");
	}

	@Test
	void upload_onFrozenVaultOrOtherUsersVault_savesNothing() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID))
				.thenThrow(new BusinessException(ErrorCode.VAULT_NOT_EDITABLE));
		when(vaultService.requireEditableVault(VAULT_ID, 2L))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		assertThatThrownBy(() -> willService.uploadWill(VAULT_ID, OWNER_ID, pdf(PDF_V1), null))
				.extracting(ex -> ((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.VAULT_NOT_EDITABLE);
		assertThatThrownBy(() -> willService.uploadWill(VAULT_ID, 2L, pdf(PDF_V1), null))
				.extracting(ex -> ((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verify(willAssetRepository, never()).save(any());
		verify(versionRepository, never()).save(any());
		verifyNoInteractions(legalDocumentRepository, auditService);
	}

	@Test
	void upload_invalidFile_savesNothing() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		MockMultipartFile text = new MockMultipartFile("file", "a.txt", "text/plain", "hello".getBytes());

		assertThatThrownBy(() -> willService.uploadWill(VAULT_ID, OWNER_ID, text, null))
				.extracting(ex -> ((BusinessException) ex).getErrorCode())
				.isEqualTo(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
		verify(willAssetRepository, never()).save(any());
		verifyNoInteractions(legalDocumentRepository, auditService);
	}

	// ---------- PS-18: phiên bản mới ----------

	@Test
	void addVersion_usesLockedLookup_incrementsVersion_newHash_keepsOldVersion() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		Asset will = storedWill();
		when(willAssetRepository.findWillForUpdate(will.getPublicId(), VAULT_DB_ID)).thenReturn(Optional.of(will));
		when(versionRepository.findMaxVersionNo(WILL_DB_ID)).thenReturn(1);
		String v1Hash = willService.uploadWill(VAULT_ID, OWNER_ID, pdf(PDF_V1), null).currentVersion().sha256();

		WillResponse response = willService.addVersion(VAULT_ID, will.getPublicId(), OWNER_ID, pdf(PDF_V2));

		assertThat(response.id()).isEqualTo(will.getPublicId());
		assertThat(response.currentVersion().version()).isEqualTo(2);
		assertThat(response.currentVersion().sha256()).isNotEqualTo(v1Hash);
		assertThat(response.status()).isEqualTo("UPLOADED");
		// Chỉ thêm bản ghi mới; repository không có hàm sửa/xóa nên phiên bản 1 không thể bị ghi đè.
		ArgumentCaptor<AssetVersion> saved = ArgumentCaptor.forClass(AssetVersion.class);
		verify(versionRepository, times(2)).save(saved.capture());
		assertThat(saved.getAllValues()).extracting(AssetVersion::getVersionNo).containsExactly(1, 2);
		// Không tạo thêm hồ sơ/legal_documents cho phiên bản mới.
		verify(legalDocumentRepository, times(1)).save(any());

		ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
		verify(auditService, times(2)).record(audit.capture());
		assertThat(audit.getAllValues().get(1).action()).isEqualTo(AuditAction.WILL_VERSION_ADDED);
		assertThat(audit.getAllValues().get(1).context()).containsEntry("version", 2);
	}

	@Test
	void addVersion_toOtherVaultsOrUnknownWill_isNotFound() {
		when(vaultService.requireEditableVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		UUID unknown = UUID.randomUUID();
		when(willAssetRepository.findWillForUpdate(unknown, VAULT_DB_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> willService.addVersion(VAULT_ID, unknown, OWNER_ID, pdf(PDF_V2)))
				.extracting(ex -> ((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		verify(versionRepository, never()).save(any());
		verifyNoInteractions(auditService);
	}

	// ---------- đọc ----------

	private static WillVersionView view(int version, String sha) {
		return new WillVersionView(WILL_DB_ID, version, "di-chuc.pdf", "application/pdf", 10, sha, "UPLOADED",
				LocalDateTime.of(2026, 10, 8, 10, version));
	}

	@Test
	void listVersions_newestFirst_andGetWill_showsLatest() {
		Asset will = storedWill();
		when(vaultService.requireOwnedVault(VAULT_ID, OWNER_ID)).thenReturn(vault());
		when(willAssetRepository.findWill(will.getPublicId(), VAULT_DB_ID)).thenReturn(Optional.of(will));
		when(versionRepository.findVersions(WILL_DB_ID)).thenReturn(List.of(view(2, "b".repeat(64)),
				view(1, "a".repeat(64))));

		assertThat(willService.listVersions(VAULT_ID, will.getPublicId(), OWNER_ID))
				.extracting(WillVersionResponse::version).containsExactly(2, 1);
		assertThat(willService.getWill(VAULT_ID, will.getPublicId(), OWNER_ID).currentVersion().version())
				.isEqualTo(2);
	}

	@Test
	void readsOnOtherUsersVault_areNotFound() {
		when(vaultService.requireOwnedVault(VAULT_ID, 2L))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		assertThatThrownBy(() -> willService.listWills(VAULT_ID, 2L, 0, 20))
				.extracting(ex -> ((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
		assertThatThrownBy(() -> willService.listVersions(VAULT_ID, UUID.randomUUID(), 2L))
				.extracting(ex -> ((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
	}
}
