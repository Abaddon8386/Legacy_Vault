package com.legacyvault.beneficiary;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetImage;
import com.legacyvault.asset.repository.AssetImageRepository;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.asset.service.AssetImageService;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.common.web.PageResponse;

/**
 * PS-104 (ST-25, ST-26, LV-HANDOVER-001): what the authenticated Beneficiary account has actually received.
 *
 * <p>Authorization is the intersection of three facts, all taken from the server: the authenticated principal, the
 * Beneficiary record linked to that account, and a handover item of that Beneficiary that Staff recorded as DELIVERED (or
 * later VERIFIED_BY_BENEFICIARY). Nothing else is readable: not the Vault, not other recipients' items, not assets that are
 * allocated but not yet delivered. A delivered item stays readable after the Vault is archived or put on hold; delivery is
 * history and is never silently revoked. Reading content or an image needs the current login password (shared attempt
 * limit) and is audited without content. One account may receive from several Vaults.
 */
@Service
public class ReceivedAssetService {

	private static final String VISIBLE = "('DELIVERED','VERIFIED_BY_BENEFICIARY')";
	private static final String FROM = """
			FROM dbo.handover_items hi
			JOIN dbo.beneficiaries b ON b.beneficiary_id = hi.beneficiary_id
			JOIN dbo.assets a ON a.asset_id = hi.asset_id
			JOIN dbo.vaults v ON v.vault_id = a.vault_id
			LEFT JOIN dbo.legal_basis_version_allocations al ON al.allocation_id = hi.allocation_id
			WHERE b.linked_user_id = ? AND a.asset_type <> 'DOCUMENT' AND hi.status IN """ + VISIBLE + " ";
	private static final String COLUMNS = """
			SELECT hi.handover_item_id, hi.public_id AS item_id, hi.status, hi.delivered_at,
			       a.asset_id AS asset_db_id, a.public_id AS asset_public_id, a.title, a.description, a.asset_type,
			       CASE WHEN a.encrypted_payload IS NULL THEN 0 ELSE 1 END AS has_payload,
			       (SELECT COUNT(*) FROM dbo.asset_images i WHERE i.asset_id = a.asset_id) AS image_count,
			       v.vault_id AS vault_db_id, v.public_id AS vault_public_id, v.vault_name,
			       al.allocation_description AS allocation_note
			""";

	private final JdbcTemplate jdbc;
	private final AssetRepository assets;
	private final AssetImageRepository images;
	private final EncryptionService encryption;
	private final PasswordReauthService reauth;
	private final AuditService audit;

	public ReceivedAssetService(JdbcTemplate jdbc, AssetRepository assets, AssetImageRepository images,
			EncryptionService encryption, PasswordReauthService reauth, AuditService audit) {
		this.jdbc = jdbc;
		this.assets = assets;
		this.images = images;
		this.encryption = encryption;
		this.reauth = reauth;
		this.audit = audit;
	}

	private record Row(long itemDbId, UUID itemId, String status, LocalDateTime deliveredAt, long assetDbId, UUID assetId,
			String name, String description, String assetType, boolean hasContent, int imageCount, long vaultDbId,
			UUID vaultId, String vaultName, String allocationNote) { }

	@Transactional(readOnly = true)
	public PageResponse<ReceivedAssetDtos.Item> list(Long accountId, int page, int size) {
		if (page < 0 || size < 1 || size > 100) {
			throw new BusinessException(ErrorCode.VALIDATION_FAILED);
		}
		Long total = jdbc.queryForObject("SELECT COUNT_BIG(*) " + FROM, Long.class, accountId);
		long count = total == null ? 0 : total;
		List<ReceivedAssetDtos.Item> content = jdbc.query(COLUMNS + FROM
				+ " ORDER BY hi.delivered_at DESC, hi.handover_item_id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
				(rs, n) -> toItem(row(rs)), accountId, (long) page * size, size);
		return new PageResponse<>(content, page, size, count, (int) Math.min(Integer.MAX_VALUE, (count + size - 1) / size));
	}

	@Transactional(readOnly = true)
	public ReceivedAssetDtos.Item get(Long accountId, UUID itemId) {
		return toItem(requireRow(accountId, itemId));
	}

	@Transactional(readOnly = true)
	public List<ReceivedAssetDtos.Image> listImages(Long accountId, UUID itemId) {
		Row row = requireRow(accountId, itemId);
		return images.findByAssetIdOrderBySlotAsc(row.assetDbId()).stream()
				.map(i -> new ReceivedAssetDtos.Image(i.getPublicId(), i.getFileName(), i.getContentType(), i.getSize(), i.getCreatedAt()))
				.toList();
	}

	@Transactional
	public ReceivedAssetDtos.Content openContent(Long accountId, UUID itemId, String password) {
		Row row = requireRow(accountId, itemId);
		reauth.requirePassword(accountId, row.vaultDbId(), password);
		Asset asset = assets.findById(row.assetDbId()).orElseThrow(ReceivedAssetService::notFound);
		if (!asset.hasPayload()) {
			throw notFound();
		}
		String payload = encryption.decrypt(asset.encryptedPayload(), AssetService.associatedData(asset));
		record(AuditAction.RECEIVED_ASSET_OPENED, accountId, row, Map.of("itemId", itemId.toString(), "assetId", row.assetId().toString()));
		return new ReceivedAssetDtos.Content(itemId, row.assetId(), payload);
	}

	@Transactional
	public ReceivedAssetDtos.ImageFile openImage(Long accountId, UUID itemId, UUID imageId, String password) {
		Row row = requireRow(accountId, itemId);
		AssetImage image = images.findByPublicIdAndAssetId(imageId, row.assetDbId()).orElseThrow(ReceivedAssetService::notFound);
		reauth.requirePassword(accountId, row.vaultDbId(), password);
		byte[] bytes = encryption.decryptBytes(image.encrypted(), AssetImageService.associatedData(row.assetId(), imageId));
		record(AuditAction.RECEIVED_ASSET_IMAGE_OPENED, accountId, row,
				Map.of("itemId", itemId.toString(), "assetId", row.assetId().toString(), "imageId", imageId.toString()));
		return new ReceivedAssetDtos.ImageFile(bytes, image.getContentType());
	}

	/** Not a recipient, not delivered, another account's item and an unknown id are all the same 404. */
	private Row requireRow(Long accountId, UUID itemId) {
		List<Row> rows = jdbc.query(COLUMNS + FROM + " AND hi.public_id = ?", (rs, n) -> row(rs), accountId, itemId.toString());
		if (rows.isEmpty()) {
			throw notFound();
		}
		return rows.getFirst();
	}

	private static Row row(ResultSet rs) throws SQLException {
		return new Row(rs.getLong("handover_item_id"), UUID.fromString(rs.getString("item_id")), rs.getString("status"),
				rs.getObject("delivered_at", LocalDateTime.class), rs.getLong("asset_db_id"),
				UUID.fromString(rs.getString("asset_public_id")), rs.getString("title"), rs.getString("description"),
				rs.getString("asset_type"), rs.getInt("has_payload") == 1, rs.getInt("image_count"), rs.getLong("vault_db_id"),
				UUID.fromString(rs.getString("vault_public_id")), rs.getString("vault_name"), rs.getString("allocation_note"));
	}

	private static ReceivedAssetDtos.Item toItem(Row r) {
		return new ReceivedAssetDtos.Item(r.itemId(), r.assetId(), r.vaultId(), r.vaultName(), r.name(), r.assetType(),
				r.description(), r.allocationNote(), r.deliveredAt().toInstant(ZoneOffset.UTC), r.status(), r.imageCount(), r.hasContent());
	}

	private void record(AuditAction action, Long accountId, Row row, Map<String, Object> details) {
		audit.record(new AuditEvent(action, AuditActorType.USER, accountId, row.vaultDbId(), "HANDOVER_ITEM", row.itemDbId(),
				null, null, null, details, "ST-26", "LV-HANDOVER-001"));
	}

	private static BusinessException notFound() {
		return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
	}
}
