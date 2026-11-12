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
 * PS-114 (D-API-43, ST-02): tài liệu PDF / Word đính kèm Asset TEXT hoặc CREDENTIAL của Owner. Được
 * {@code AssetDocumentController} (các endpoint {@code /api/v1/vaults/{vaultId}/assets/{assetId}/documents}) gọi.
 *
 * <p>Cùng mô hình tin cậy với ảnh Asset: chỉ Owner của Vault, Vault phải ACTIVE cho mọi thay đổi, upload dưới khóa Owner để
 * quota lưu trữ và giới hạn mỗi Asset được kiểm tra và ghi nguyên tử, nội dung mã hóa AES-256-GCM (AAD = id asset và
 * document) và đọc cần mật khẩu đăng nhập hiện tại. Tài liệu không phải Will (Asset DOCUMENT có version) cũng không phải
 * bằng chứng intake của Staff. Byte của nó tính vào dung lượng lưu trữ; không chiếm slot Asset. Audit không bao giờ chứa
 * tên file hay nội dung.
 *
 * <p>Bảng: {@code asset_documents}, {@code assets}. Audit: {@code ASSET_DOCUMENT_ADDED}, {@code ASSET_DOCUMENT_OPENED},
 * {@code ASSET_DOCUMENT_REMOVED}. Phụ thuộc: {@code VaultService}, {@code OwnerQuotaService}, {@code EncryptionService},
 * {@code PasswordReauthService}, {@code AuditService}.
 */
@Service
public class AssetDocumentService {

	/**
	 * Repository bảng {@code asset_documents}.
	 */
	private final AssetDocumentRepository documents;
	/**
	 * Repository bảng {@code assets} (tìm Asset chủ của tài liệu).
	 */
	private final AssetRepository assets;
	/**
	 * Kiểm tra ownership và trạng thái Vault.
	 */
	private final VaultService vaults;
	/**
	 * Khóa Owner và kiểm tra quota lưu trữ / kích thước file.
	 */
	private final OwnerQuotaService quotas;
	/**
	 * Mã hóa / giải mã AES-256-GCM.
	 */
	private final EncryptionService encryption;
	/**
	 * Xác thực lại mật khẩu (có giới hạn số lần thử) trước khi mở file.
	 */
	private final PasswordReauthService reauth;
	/**
	 * Ghi nhật ký audit.
	 */
	private final AuditService audit;
	/**
	 * Dung lượng tối đa mỗi file (cấu hình {@code legacyvault.asset-documents.max-file-bytes}, mặc định 10 MB).
	 */
	private final long maxFileBytes;
	/**
	 * Số tài liệu tối đa mỗi Asset (cấu hình {@code legacyvault.asset-documents.max-per-asset}, mặc định 5).
	 */
	private final int maxPerAsset;

	/**
	 * Khởi tạo service và kiểm tra cấu hình hợp lệ.
	 *
	 * @throws IllegalArgumentException nếu {@code maxFileBytes} hoặc {@code maxPerAsset} nhỏ hơn 1
	 */
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

	/**
	 * File đã giải mã để stream cho client; không bao giờ ghi log.
	 *
	 * <ul>
	 * <li>{@code content} - byte giải mã</li>
	 * <li>{@code contentType} - MIME</li>
	 * <li>{@code fileName} - tên file</li>
	 * </ul>
	 */
	public record DocumentFile(byte[] content, String contentType, String fileName) { }

	/**
	 * Metadata của tài liệu đính kèm: không có nội dung, không có đường dẫn. Trả về từ API liệt kê / upload.
	 *
	 * <ul>
	 * <li>{@code id} - public id; {@code fileName}, {@code contentType}, {@code sizeBytes}, {@code sha256}, {@code createdAt} - metadata</li>
	 * </ul>
	 */
	public record DocumentInfo(UUID id, String fileName, String contentType, long sizeBytes, String sha256,
			java.time.Instant createdAt) {
		/**
		 * Dựng {@link DocumentInfo} từ entity {@link AssetDocument}.
		 */
		static DocumentInfo from(AssetDocument d) {
			return new DocumentInfo(d.getPublicId(), d.getFileName(), d.getContentType(), d.getSize(), d.getSha256(), d.getCreatedAt());
		}
	}

	/**
	 * Liệt kê metadata tài liệu của Asset ({@code GET .../documents}).
	 *
	 * @param vaultId public id của Vault
	 * @param assetId public id của Asset
	 * @param ownerUserId id Owner đang đăng nhập
	 * @return danh sách {@link DocumentInfo} theo thứ tự tải lên
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND nếu Vault/Asset không thuộc Owner
	 */
	@Transactional(readOnly = true)
	public List<DocumentInfo> list(UUID vaultId, UUID assetId, Long ownerUserId) {
		Vault vault = vaults.requireOwnedVault(vaultId, ownerUserId);
		Asset asset = requireAsset(vault.getVaultId(), assetId);
		return documents.findRowsByAssetId(asset.getAssetId()).stream()
				.map(r -> new DocumentInfo(r.id(), r.fileName(), r.contentType(), r.sizeBytes(), r.sha256(), r.createdAt()))
				.toList();
	}

	/**
	 * Thêm tài liệu cho Asset ({@code POST .../documents}). Tất cả file của một request được lưu hoặc không file nào: file lỗi,
	 * vượt giới hạn mỗi Asset hay quota đều rollback toàn bộ.
	 *
	 * Các bước: khóa Owner ({@code quotas.lockOwner}) -> Vault ACTIVE có khóa ghi -> tìm Asset -> kiểm tra danh sách không rỗng
	 * và tổng số file không vượt {@code maxPerAsset} -> {@link AssetDocumentFile#inspect} từng file -> kiểm tra kích thước file và quota
	 * tăng trưởng ({@code quotas.requireGrowth}) -> mã hóa (AAD = asset + document) và lưu -> audit {@code ASSET_DOCUMENT_ADDED}.
	 *
	 * @return danh sách tài liệu hiện có của Asset sau khi thêm
	 * @throws com.legacyvault.common.exception.BusinessException VALIDATION_FAILED, ASSET_DOCUMENT_LIMIT_EXCEEDED, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, lỗi quota, RESOURCE_NOT_FOUND
	 */
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

	/**
	 * Mở (giải mã) một tài liệu ({@code POST .../documents/{documentId}/download}). Cần mật khẩu hiện tại (chung giới hạn số lần thử);
	 * thứ tự kiểm tra: ownership 404 -> Vault bị đóng băng 409 -> mật khẩu 403/429. Audit {@code ASSET_DOCUMENT_OPENED}.
	 *
	 * @param password mật khẩu đăng nhập hiện tại
	 * @return {@link DocumentFile} đã giải mã
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND hoặc lỗi xác thực lại mật khẩu
	 */
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

	/**
	 * Xóa tài liệu khỏi Asset ({@code DELETE .../documents/{documentId}}) dưới khóa Owner; flush rồi audit {@code ASSET_DOCUMENT_REMOVED}.
	 *
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND nếu không tồn tại / không thuộc Owner
	 */
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

	/**
	 * Will (Asset DOCUMENT), Asset không tồn tại và Asset của Owner khác đều cùng một lỗi 404 RESOURCE_NOT_FOUND.
	 */
	private Asset requireAsset(Long vaultDbId, UUID assetId) {
		return assets.findByPublicIdAndVaultIdAndAssetTypeNot(assetId, vaultDbId, AssetType.DOCUMENT)
				.orElseThrow(AssetDocumentService::notFound);
	}

	/**
	 * Ghi audit {@link AuditEvent} cho thao tác tài liệu (entity {@code ASSET_DOCUMENT}, scope {@code ST-02}); chi tiết không chứa tên file.
	 */
	private void record(AuditAction action, Long owner, Long vaultDbId, Long assetDbId, UUID documentId, Map<String, Object> details) {
		audit.record(new AuditEvent(action, AuditActorType.USER, owner, vaultDbId, "ASSET_DOCUMENT", assetDbId, null, null, null,
				details, "ST-02", null));
	}

	/**
	 * Tạo associated data cho AES-GCM: gắn ciphertext với cặp (asset, document).
	 */
	private static byte[] aad(UUID asset, UUID document) {
		return ("asset-document:" + asset + ":" + document).getBytes(StandardCharsets.UTF_8);
	}

	/**
	 * Tạo lỗi RESOURCE_NOT_FOUND dùng chung.
	 */
	private static BusinessException notFound() {
		return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
	}
}
