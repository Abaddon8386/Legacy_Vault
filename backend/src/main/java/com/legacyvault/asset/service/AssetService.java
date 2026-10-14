package com.legacyvault.asset.service;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.asset.dto.AssetResponse;
import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.service.VaultService;

/**
 * Tạo và liệt kê Asset của Vault (PS-15, ST-02). Ownership qua {@link VaultService}; payload mã hóa trước
 * khi lưu và không bao giờ được trả ra hay ghi log. Tạo Asset không phải bàn giao.
 */
@Service
public class AssetService {

	static final String ENTITY_ASSET = "ASSET";

	private final AssetRepository assetRepository;
	private final VaultService vaultService;
	private final EncryptionService encryptionService;
	private final AuditService auditService;

	public AssetService(AssetRepository assetRepository, VaultService vaultService,
			EncryptionService encryptionService, AuditService auditService) {
		this.assetRepository = assetRepository;
		this.vaultService = vaultService;
		this.encryptionService = encryptionService;
		this.auditService = auditService;
	}

	@Transactional
	public AssetResponse createAsset(UUID vaultId, Long ownerUserId, CreateAssetRequest request) {
		Vault vault = vaultService.requireEditableVault(vaultId, ownerUserId);

		// DTO đã chặn giá trị khác TEXT/CREDENTIAL nên valueOf không thể lỗi ở đây.
		AssetType type = AssetType.valueOf(request.assetType());
		Asset asset = new Asset(vault.getVaultId(), type, request.name().trim(), normalize(request.description()));
		asset.setEncryptedPayload(encryptionService.encrypt(request.payload(), associatedData(asset)));
		Asset saved = assetRepository.save(asset);

		auditService.record(new AuditEvent(AuditAction.ASSET_CREATED, AuditActorType.USER, ownerUserId, vault.getVaultId(),
				ENTITY_ASSET, saved.getAssetId(), null, null, null, Map.of("assetType", type.name()), "ST-02", null));
		return AssetResponse.from(saved, vault.getPublicId());
	}

	@Transactional(readOnly = true)
	public PageResponse<AssetResponse> listAssets(UUID vaultId, Long ownerUserId, int page, int size) {
		Vault vault = vaultService.requireOwnedVault(vaultId, ownerUserId);
		PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
		return PageResponse.from(
				assetRepository.findByVaultIdAndAssetTypeNot(vault.getVaultId(), AssetType.DOCUMENT, pageable),
				asset -> AssetResponse.from(asset, vault.getPublicId()));
	}

	/** Gắn ciphertext với đúng Asset (UUID công khai): chép sang bản ghi khác thì giải mã thất bại. */
	static byte[] associatedData(Asset asset) {
		return asset.getPublicId().toString().getBytes(StandardCharsets.UTF_8);
	}

	private static String normalize(String value) {
		if (value == null) {
			return null;
		}
		String trimmed = value.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}
}
