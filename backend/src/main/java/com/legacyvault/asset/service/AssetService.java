package com.legacyvault.asset.service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.asset.dto.AssetResponse;
import com.legacyvault.asset.dto.AssetSecretResponse;
import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.dto.UpdateAssetRequest;
import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.service.VaultService;

/**
 * Tạo, liệt kê, xem và cập nhật Asset của Vault (PS-15, PS-16, ST-02). Ownership qua {@link VaultService};
 * payload mã hóa trước khi lưu và không bao giờ được trả ra hay ghi log. Tạo Asset không phải bàn giao.
 */
@Service
public class AssetService {

	static final String ENTITY_ASSET = "ASSET";

	private final AssetRepository assetRepository;
	private final VaultService vaultService;
	private final EncryptionService encryptionService;
	private final AuditService auditService;
	private final PasswordReauthService reauthService;

	public AssetService(AssetRepository assetRepository, VaultService vaultService,
			EncryptionService encryptionService, AuditService auditService, PasswordReauthService reauthService) {
		this.assetRepository = assetRepository;
		this.vaultService = vaultService;
		this.encryptionService = encryptionService;
		this.auditService = auditService;
		this.reauthService = reauthService;
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

	@Transactional(readOnly = true)
	public AssetResponse getAsset(UUID vaultId, UUID assetId, Long ownerUserId) {
		Vault vault = vaultService.requireOwnedVault(vaultId, ownerUserId);
		return AssetResponse.from(requireAsset(vault, assetId), vault.getPublicId());
	}

	/**
	 * Cập nhật một phần (PS-16): chỉ {@code name}, {@code description}, {@code payload}. Không có thay đổi thực sự thì
	 * không ghi DB, không audit. Audit chỉ ghi tên trường đã đổi, không ghi giá trị.
	 */
	@Transactional
	public AssetResponse updateAsset(UUID vaultId, UUID assetId, Long ownerUserId, UpdateAssetRequest request) {
		Vault vault = vaultService.requireEditableVault(vaultId, ownerUserId);
		Asset asset = requireAsset(vault, assetId);

		List<String> changedFields = new ArrayList<>();
		if (request.name() != null && !request.name().trim().equals(asset.getName())) {
			asset.rename(request.name().trim());
			changedFields.add("name");
		}
		if (request.description() != null) {
			String description = normalize(request.description());
			if (!Objects.equals(description, asset.getDescription())) {
				asset.changeDescription(description);
				changedFields.add("description");
			}
		}
		if (request.payload() != null) {
			// Không so với payload cũ (phải giải mã): gửi payload là ghi lại với IV mới.
			asset.setEncryptedPayload(encryptionService.encrypt(request.payload(), associatedData(asset)));
			changedFields.add("payload");
		}
		if (changedFields.isEmpty()) {
			return AssetResponse.from(asset, vault.getPublicId());
		}

		// Flush ngay để @PreUpdate cập nhật updatedAt trước khi dựng response.
		Asset saved = assetRepository.saveAndFlush(asset);
		auditService.record(new AuditEvent(AuditAction.ASSET_UPDATED, AuditActorType.USER, ownerUserId, vault.getVaultId(),
				ENTITY_ASSET, saved.getAssetId(), null, null, null, Map.of("changedFields", changedFields), "ST-02", null));
		return AssetResponse.from(saved, vault.getPublicId());
	}

	/**
	 * Xem nội dung bảo mật (D-API-32): chỉ Owner của kho, kho còn {@code ACTIVE} và nhập đúng mật khẩu hiện tại.
	 * Thứ tự kiểm tra: ownership (404) -> trạng thái kho (409) -> mật khẩu/giới hạn (403/429), nên người lạ không thể
	 * dùng việc dò mật khẩu để biết Asset có tồn tại. Giải mã chỉ trong bộ nhớ; audit không ghi nội dung.
	 */
	@Transactional
	public AssetSecretResponse revealAsset(UUID vaultId, UUID assetId, Long ownerUserId, String password) {
		Vault vault = vaultService.requireEditableVault(vaultId, ownerUserId);
		Asset asset = requireAsset(vault, assetId);
		reauthService.requirePassword(ownerUserId, vault.getVaultId(), password);

		if (!asset.hasPayload()) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
		String payload = encryptionService.decrypt(asset.encryptedPayload(), associatedData(asset));

		auditService.record(new AuditEvent(AuditAction.ASSET_REVEALED, AuditActorType.USER, ownerUserId, vault.getVaultId(),
				ENTITY_ASSET, asset.getAssetId(), null, null, null, Map.of("assetType", asset.getAssetType().name()), "ST-02",
				null));
		return new AssetSecretResponse(asset.getPublicId(), payload);
	}

	/** Asset không tồn tại, thuộc Vault khác, hoặc là di chúc -> cùng 404 (D-API-07). */
	private Asset requireAsset(Vault vault, UUID assetId) {
		return assetRepository.findByPublicIdAndVaultIdAndAssetTypeNot(assetId, vault.getVaultId(), AssetType.DOCUMENT)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
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
