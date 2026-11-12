package com.legacyvault.will.service;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.common.web.PageResponse;
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
import com.legacyvault.subscription.service.OwnerQuotaService;
import com.legacyvault.subscription.service.QuotaPolicy.Delta;

/**
 * Bản số hóa di chúc (PS-17, PS-18 — ST-03, LV-WILL-001), được {@code WillController} gọi
 * (các endpoint {@code /api/v1/vaults/{vaultId}/wills}).
 *
 * <ul>
 * <li>Chỉ ghi nhận bản scan/ảnh: trạng thái tải lên của phiên bản là {@code UPLOADED} và {@code legal_documents.verification_status}
 * luôn khởi đầu {@code PENDING_VERIFICATION}; không bao giờ đặt {@code LEGAL_APPROVED} hay bất kỳ trạng thái thẩm định nào (thuộc Legal ở ST-15).</li>
 * <li>Mỗi phiên bản có metadata toàn vẹn riêng (SHA-256 của byte gốc, kích thước, loại). File mới = phiên bản mới,
 * phiên bản cũ giữ nguyên.</li>
 * <li>Nội dung file mã hóa trước khi lưu; không log, không đưa vào audit.</li>
 * </ul>
 *
 * <p>Bảng: {@code assets} (DOCUMENT), {@code legal_documents}, {@code asset_versions}. Audit: {@code WILL_UPLOADED},
 * {@code WILL_VERSION_ADDED}, {@code WILL_FILE_OPENED}. Ghi dưới khóa Owner để quota nhất quán.
 */
@Service
public class WillService {

	/**
	 * Tên entity ghi trong audit.
	 */
	static final String ENTITY_WILL = "WILL";
	/**
	 * Mã bước nghiệp vụ trong audit (ST-03).
	 */
	static final String STEP_WILL_UPLOAD = "ST-03";
	/**
	 * Mã quy tắc nghiệp vụ trong audit (LV-WILL-001).
	 */
	static final String RULE_WILL = "LV-WILL-001";
	/**
	 * Độ dài tối đa tiêu đề Asset (cột title 200 ký tự).
	 */
	private static final int MAX_TITLE_LENGTH = 200;

	/**
	 * Truy vấn Asset di chúc.
	 */
	private final WillAssetRepository willAssetRepository;
	/**
	 * Truy vấn phiên bản file.
	 */
	private final AssetVersionRepository versionRepository;
	/**
	 * Lưu bản ghi {@code legal_documents}.
	 */
	private final LegalDocumentRepository legalDocumentRepository;
	/**
	 * Kiểm tra ownership / trạng thái Vault.
	 */
	private final VaultService vaultService;
	/**
	 * Mã hóa / giải mã nội dung file.
	 */
	private final EncryptionService encryptionService;
	/**
	 * Ghi audit.
	 */
	private final AuditService auditService;
	/**
	 * Xác thực lại mật khẩu trước khi mở file.
	 */
	private final PasswordReauthService reauthService;
	/**
	 * Dung lượng tối đa mỗi file ({@code legacyvault.will.max-file-bytes}, mặc định 10 MB).
	 */
	private final long maxFileBytes;
	/**
	 * Khóa Owner và kiểm tra quota.
	 */
	private final OwnerQuotaService quotas;

	/**
	 * Khởi tạo service với các phụ thuộc do Spring inject.
	 */
	public WillService(WillAssetRepository willAssetRepository, AssetVersionRepository versionRepository,
			LegalDocumentRepository legalDocumentRepository, VaultService vaultService,
			EncryptionService encryptionService, AuditService auditService, PasswordReauthService reauthService,
			@Value("${legacyvault.will.max-file-bytes:10485760}") long maxFileBytes, OwnerQuotaService quotas) {
		this.willAssetRepository = willAssetRepository;
		this.versionRepository = versionRepository;
		this.legalDocumentRepository = legalDocumentRepository;
		this.vaultService = vaultService;
		this.encryptionService = encryptionService;
		this.auditService = auditService;
		this.reauthService = reauthService;
		this.maxFileBytes = maxFileBytes;
		this.quotas = quotas;
	}

	/**
	 * PS-17: tạo hồ sơ di chúc mới với phiên bản 1 ({@code POST .../wills}).
	 *
	 * Các bước: khóa Owner -> Vault ACTIVE có khóa ghi -> {@link WillFile#inspect} -> kiểm tra kích thước file và quota (+1 Asset, + byte) ->
	 * lưu Asset DOCUMENT + {@code LegalDocument} (PENDING_VERIFICATION) -> lưu phiên bản 1 đã mã hóa -> audit {@code WILL_UPLOADED}.
	 *
	 * @param note ghi chú tùy chọn, lưu vào mô tả Asset
	 * @return {@link WillResponse}
	 * @throws com.legacyvault.common.exception.BusinessException VALIDATION_FAILED, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, lỗi quota, RESOURCE_NOT_FOUND
	 */
	@Transactional
	public WillResponse uploadWill(UUID vaultId, Long ownerUserId, MultipartFile file, String note) {
		quotas.lockOwner(ownerUserId);
		Vault vault = vaultService.requireEditableVaultForUpdate(vaultId, ownerUserId);
		WillFile willFile = WillFile.inspect(file, maxFileBytes);
		quotas.requireFileSize(ownerUserId, willFile.size());
		quotas.requireGrowth(ownerUserId, new Delta(1, willFile.size()));

		Asset will = willAssetRepository.save(new Asset(vault.getVaultId(), AssetType.DOCUMENT,
				truncate(willFile.fileName(), MAX_TITLE_LENGTH), normalize(note)));
		legalDocumentRepository.save(LegalDocument.will(will.getAssetId()));
		AssetVersion version = storeVersion(will, 1, willFile, ownerUserId);

		auditService.record(new AuditEvent(AuditAction.WILL_UPLOADED, AuditActorType.USER, ownerUserId, vault.getVaultId(),
				ENTITY_WILL, will.getAssetId(), null, null, null, integrityDetails(version), STEP_WILL_UPLOAD, RULE_WILL));
		return WillResponse.from(will, vault.getPublicId(), view(version));
	}

	/**
	 * PS-18: thêm phiên bản mới cho hồ sơ di chúc đã có ({@code POST .../wills/{willId}/versions}); phiên bản cũ không bị sửa.
	 * Khóa dòng Asset ({@code findWillForUpdate}) để không cấp trùng số phiên bản; audit {@code WILL_VERSION_ADDED}.
	 *
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND và các lỗi file / quota như {@link #uploadWill}
	 */
	@Transactional
	public WillResponse addVersion(UUID vaultId, UUID willId, Long ownerUserId, MultipartFile file) {
		quotas.lockOwner(ownerUserId);
		Vault vault = vaultService.requireEditableVaultForUpdate(vaultId, ownerUserId);
		Asset will = willAssetRepository.findWillForUpdate(willId, vault.getVaultId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		WillFile willFile = WillFile.inspect(file, maxFileBytes);
		quotas.requireFileSize(ownerUserId, willFile.size());
		quotas.requireGrowth(ownerUserId, new Delta(0, willFile.size()));

		int nextVersion = versionRepository.findMaxVersionNo(will.getAssetId()) + 1;
		AssetVersion version = storeVersion(will, nextVersion, willFile, ownerUserId);

		auditService.record(new AuditEvent(AuditAction.WILL_VERSION_ADDED, AuditActorType.USER, ownerUserId, vault.getVaultId(),
				ENTITY_WILL, will.getAssetId(), null, null, null, integrityDetails(version), STEP_WILL_UPLOAD, RULE_WILL));
		return WillResponse.from(will, vault.getPublicId(), view(version));
	}

	/**
	 * Liệt kê di chúc của Vault ({@code GET .../wills}), mới nhất trước; nạp phiên bản mới nhất của cả trang bằng một truy vấn.
	 *
	 * @return trang {@link WillResponse}
	 */
	@Transactional(readOnly = true)
	public PageResponse<WillResponse> listWills(UUID vaultId, Long ownerUserId, int page, int size) {
		Vault vault = vaultService.requireOwnedVault(vaultId, ownerUserId);
		Page<Asset> wills = willAssetRepository.findWills(vault.getVaultId(),
				PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
		List<Long> ids = wills.getContent().stream().map(Asset::getAssetId).toList();
		Map<Long, WillVersionView> latest = ids.isEmpty() ? Map.of()
				: versionRepository.findLatestVersions(ids).stream()
						.collect(Collectors.toMap(WillVersionView::assetId, Function.identity()));
		return PageResponse.from(wills, will -> WillResponse.from(will, vault.getPublicId(),
				latest.get(will.getAssetId())));
	}

	/**
	 * Xem một di chúc kèm phiên bản hiện tại ({@code GET .../wills/{willId}}).
	 *
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND
	 */
	@Transactional(readOnly = true)
	public WillResponse getWill(UUID vaultId, UUID willId, Long ownerUserId) {
		Vault vault = vaultService.requireOwnedVault(vaultId, ownerUserId);
		Asset will = requireWill(willId, vault);
		return WillResponse.from(will, vault.getPublicId(), versionRepository.findVersions(will.getAssetId()).get(0));
	}

	/**
	 * PS-18: toàn bộ phiên bản ({@code GET .../wills/{willId}/versions}), mới nhất trước, để đối chiếu toàn vẹn.
	 */
	@Transactional(readOnly = true)
	public List<WillVersionResponse> listVersions(UUID vaultId, UUID willId, Long ownerUserId) {
		Vault vault = vaultService.requireOwnedVault(vaultId, ownerUserId);
		Asset will = requireWill(willId, vault);
		return versionRepository.findVersions(will.getAssetId()).stream().map(WillVersionResponse::from).toList();
	}

	/**
	 * Mở/tải nội dung một phiên bản file di chúc (D-API-33, {@code POST .../versions/{version}/download}): Owner của kho, kho còn {@code ACTIVE}, nhập đúng mật khẩu
	 * hiện tại. Thứ tự: ownership (404) -> trạng thái kho (409) -> phiên bản (404) -> mật khẩu/giới hạn (403/429).
	 *
	 * <p>Sau khi giải mã, SHA-256 của nội dung được so với hash đã lưu lúc tải lên; lệch (dữ liệu bị sửa trong DB) thì
	 * từ chối, không trả file. Audit {@code WILL_FILE_OPENED} chỉ ghi phiên bản/hash/kích thước, không ghi tên file hay nội dung.
	 *
	 * @return {@link WillFileDownload}
	 * @throws IllegalStateException nếu hash không khớp
	 */
	@Transactional
	public WillFileDownload openVersion(UUID vaultId, UUID willId, int versionNo, Long ownerUserId, String password) {
		Vault vault = vaultService.requireEditableVault(vaultId, ownerUserId);
		Asset will = requireWill(willId, vault);
		AssetVersion version = versionRepository.findByAssetIdAndVersionNo(will.getAssetId(), versionNo)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		reauthService.requirePassword(ownerUserId, vault.getVaultId(), password);

		byte[] content = encryptionService.decryptBytes(version.encryptedContent(),
				version.getPublicId().toString().getBytes(StandardCharsets.UTF_8));
		if (!version.getSha256Hash().equals(WillFile.sha256Hex(content))) {
			throw new IllegalStateException("Stored will content does not match its recorded SHA-256");
		}

		auditService.record(new AuditEvent(AuditAction.WILL_FILE_OPENED, AuditActorType.USER, ownerUserId,
				vault.getVaultId(), ENTITY_WILL, will.getAssetId(), null, null, null, integrityDetails(version),
				STEP_WILL_UPLOAD, RULE_WILL));
		return new WillFileDownload(content, version.getContentType(), version.getOriginalFileName(),
				version.getSha256Hash());
	}

	/**
	 * Tìm di chúc trong Vault; không có -> RESOURCE_NOT_FOUND.
	 */
	private Asset requireWill(UUID willId, Vault vault) {
		return willAssetRepository.findWill(willId, vault.getVaultId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
	}

	/**
	 * Tạo và lưu một phiên bản: mã hóa nội dung với associatedData là public id của phiên bản (chép sang phiên bản khác sẽ giải mã thất bại).
	 */
	private AssetVersion storeVersion(Asset will, int versionNo, WillFile file, Long ownerUserId) {
		AssetVersion version = new AssetVersion(will.getAssetId(), versionNo, file.fileName(), file.contentType(),
				file.size(), file.sha256(), ownerUserId);
		// Nội dung file gắn với đúng phiên bản (UUID của phiên bản): chép sang phiên bản khác sẽ giải mã thất bại.
		version.setEncryptedContent(encryptionService.encrypt(file.content(),
				version.getPublicId().toString().getBytes(StandardCharsets.UTF_8)));
		return versionRepository.save(version);
	}

	/**
	 * Chỉ metadata toàn vẹn (version, sha256, sizeBytes, contentType) cho audit — không có nội dung file, không có tên file (có thể chứa thông tin cá nhân).
	 */
	private static Map<String, Object> integrityDetails(AssetVersion version) {
		Map<String, Object> details = new LinkedHashMap<>();
		details.put("version", version.getVersionNo());
		details.put("sha256", version.getSha256Hash());
		details.put("sizeBytes", version.getFileSizeBytes());
		details.put("contentType", version.getContentType());
		return details;
	}

	/**
	 * Chuyển entity {@link AssetVersion} thành {@link WillVersionView} để dựng response.
	 */
	private static WillVersionView view(AssetVersion version) {
		return new WillVersionView(version.getAssetId(), version.getVersionNo(), version.getOriginalFileName(),
				version.getContentType(), version.getFileSizeBytes(), version.getSha256Hash(),
				version.getUploadStatus(), version.getUploadedAt());
	}

	/**
	 * Trim; null hoặc rỗng trả về null.
	 */
	private static String normalize(String value) {
		if (value == null) {
			return null;
		}
		String trimmed = value.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}

	/**
	 * Cắt chuỗi còn tối đa {@code max} ký tự.
	 */
	private static String truncate(String value, int max) {
		return value.length() > max ? value.substring(0, max) : value;
	}
}
