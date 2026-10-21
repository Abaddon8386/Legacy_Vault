package com.legacyvault.asset.service;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetDocument;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetDocumentRepository;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.subscription.service.OwnerQuotaService;
import com.legacyvault.subscription.service.QuotaPolicy.Delta;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.service.VaultService;

/**
 * PS-114 (D-API-43, ST-02): PDF / Word documents attached to an Owner's TEXT or CREDENTIAL Asset.
 *
 * <p>Same trust model as asset images: only the Owner of the Vault, Vault ACTIVE for every mutation, upload under the Owner
 * lock so the storage quota and the per-asset limit are checked and written atomically, content encrypted with AES-256-GCM
 * (AAD = asset and document ids) and reads that need the current login password. A document is neither a Will (DOCUMENT
 * Assets with versions) nor Staff intake evidence. Its bytes count toward storage; it does not occupy an Asset slot.
 * Audit never carries file names or content.
 */
@Service
public class AssetDocumentService {

	private final AssetDocumentRepository documents;
	private final AssetRepository assets;
	private final VaultService vaults;
	private final OwnerQuotaService quotas;
	private final EncryptionService encryption;
	private final PasswordReauthService reauth;
	private final AuditService audit;
	private final long maxFileBytes;
	private final int maxPerAsset;

	public AssetDocumentService(AssetDocumentRepository documents, AssetRepository assets, VaultService vaults,
			OwnerQuotaService quotas, EncryptionService encryption, PasswordReauthService reauth, AuditService audit,
			// TODO(open-question): file policy (size, count, retention) is a proposal until the group confirms D-API-43.
			@Value("${legacyvault.asset-documents.max-file-bytes:10485760}") long maxFileBytes,
			@Value("${legacyvault.asset-documents.max-per-asset:5}") int maxPerAsset) {
		if (maxFileBytes < 1 || maxPerAsset < 1) {
			throw new IllegalArgumentException("Invalid asset document configuration");
		}
		this.documents = documents;
		this.assets = assets;
		this.vaults = vaults;
		this.quotas = quotas;
		this.encryption = encryption;
		this.reauth = reauth;
		this.audit = audit;
		this.maxFileBytes = maxFileBytes;
		this.maxPerAsset = maxPerAsset;
	}

	/** Decrypted file for streaming; never logged. */
	public record DocumentFile(byte[] content, String contentType, String fileName) { }

	/** Metadata of an attached document: no content, no path. */
	public record DocumentInfo(UUID id, String fileName, String contentType, long sizeBytes, String sha256,
			java.time.Instant createdAt) {
		static DocumentInfo from(AssetDocument d) {
			return new DocumentInfo(d.getPublicId(), d.getFileName(), d.getContentType(), d.getSize(), d.getSha256(), d.getCreatedAt());
		}
	}

	@Transactional(readOnly = true)
	public List<DocumentInfo> list(UUID vaultId, UUID assetId, Long ownerUserId) {
		Vault vault = vaults.requireOwnedVault(vaultId, ownerUserId);
		Asset asset = requireAsset(vault.getVaultId(), assetId);
		return documents.findRowsByAssetId(asset.getAssetId()).stream()
				.map(r -> new DocumentInfo(r.id(), r.fileName(), r.contentType(), r.sizeBytes(), r.sha256(), r.createdAt()))
				.toList();
	}

	/** All files of one request are stored or none: a bad file, the per-asset limit or the quota rolls everything back. */
	@Transactional
	public List<DocumentInfo> add(UUID vaultId, UUID assetId, Long ownerUserId, List<MultipartFile> files) {
		quotas.lockOwner(ownerUserId);
		Vault vault = vaults.requireEditableVaultForUpdate(vaultId, ownerUserId);
		Asset asset = requireAsset(vault.getVaultId(), assetId);
		if (files == null || files.isEmpty()) {
			throw new BusinessException(ErrorCode.VALIDATION_FAILED);
		}
		if (files.size() + documents.countByAssetId(asset.getAssetId()) > maxPerAsset) {
			throw new BusinessException(ErrorCode.ASSET_DOCUMENT_LIMIT_EXCEEDED);
		}
		List<AssetDocumentFile> inspected = files.stream().map(f -> AssetDocumentFile.inspect(f, maxFileBytes)).toList();
		for (AssetDocumentFile file : inspected) {
			quotas.requireFileSize(ownerUserId, file.size());
		}
		quotas.requireGrowth(ownerUserId, new Delta(0, inspected.stream().mapToLong(AssetDocumentFile::size).sum()));
		for (AssetDocumentFile file : inspected) {
			AssetDocument document = new AssetDocument(asset.getAssetId(), file.fileName(), file.contentType(), file.size(), file.sha256());
			document.encrypt(encryption.encrypt(file.content(), aad(assetId, document.getPublicId())));
			AssetDocument saved = documents.saveAndFlush(document);
			record(AuditAction.ASSET_DOCUMENT_ADDED, ownerUserId, vault.getVaultId(), asset.getAssetId(), saved.getPublicId(),
					Map.of("documentId", saved.getPublicId().toString(), "contentType", saved.getContentType(),
							"sizeBytes", saved.getSize(), "sha256", saved.getSha256()));
		}
		return documents.findRowsByAssetId(asset.getAssetId()).stream()
				.map(r -> new DocumentInfo(r.id(), r.fileName(), r.contentType(), r.sizeBytes(), r.sha256(), r.createdAt()))
				.toList();
	}

	/** Reading needs the current password (shared attempt limit); ownership 404 and frozen Vault 409 come first. */
	@Transactional
	public DocumentFile open(UUID vaultId, UUID assetId, UUID documentId, Long ownerUserId, String password) {
		Vault vault = vaults.requireEditableVault(vaultId, ownerUserId);
		Asset asset = requireAsset(vault.getVaultId(), assetId);
		AssetDocument document = documents.findByPublicIdAndAssetId(documentId, asset.getAssetId())
				.orElseThrow(AssetDocumentService::notFound);
		reauth.requirePassword(ownerUserId, vault.getVaultId(), password);
		byte[] content = encryption.decryptBytes(document.encrypted(), aad(assetId, documentId));
		record(AuditAction.ASSET_DOCUMENT_OPENED, ownerUserId, vault.getVaultId(), asset.getAssetId(), documentId,
				Map.of("documentId", documentId.toString()));
		return new DocumentFile(content, document.getContentType(), document.getFileName());
	}

	@Transactional
	public void delete(UUID vaultId, UUID assetId, UUID documentId, Long ownerUserId) {
		quotas.lockOwner(ownerUserId);
		Vault vault = vaults.requireEditableVaultForUpdate(vaultId, ownerUserId);
		Asset asset = requireAsset(vault.getVaultId(), assetId);
		AssetDocument document = documents.findByPublicIdAndAssetId(documentId, asset.getAssetId())
				.orElseThrow(AssetDocumentService::notFound);
		documents.delete(document);
		documents.flush();
		record(AuditAction.ASSET_DOCUMENT_REMOVED, ownerUserId, vault.getVaultId(), asset.getAssetId(), documentId,
				Map.of("documentId", documentId.toString()));
	}

	/** A Will (DOCUMENT Asset), an unknown Asset and another Owner's Asset are all the same 404. */
	private Asset requireAsset(Long vaultDbId, UUID assetId) {
		return assets.findByPublicIdAndVaultIdAndAssetTypeNot(assetId, vaultDbId, AssetType.DOCUMENT)
				.orElseThrow(AssetDocumentService::notFound);
	}

	private void record(AuditAction action, Long owner, Long vaultDbId, Long assetDbId, UUID documentId, Map<String, Object> details) {
		audit.record(new AuditEvent(action, AuditActorType.USER, owner, vaultDbId, "ASSET_DOCUMENT", assetDbId, null, null, null,
				details, "ST-02", null));
	}

	private static byte[] aad(UUID asset, UUID document) {
		return ("asset-document:" + asset + ":" + document).getBytes(StandardCharsets.UTF_8);
	}

	private static BusinessException notFound() {
		return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
	}
}
