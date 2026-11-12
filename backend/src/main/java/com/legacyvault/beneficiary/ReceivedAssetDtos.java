package com.legacyvault.beneficiary;

import java.time.Instant;
import java.util.UUID;

/**
 * PS-104: read model of assets that Staff physically handed to the authenticated account (handover item DELIVERED or
 * VERIFIED_BY_BENEFICIARY). Public ids only; never an internal key, another recipient, an undelivered asset or content.
 */
public final class ReceivedAssetDtos {
	/**
	 * Lớp tiện ích, không cho khởi tạo.
	 */
	private ReceivedAssetDtos() { }

	/**
	 * {@code itemId} is the handover item public id and the key of every other endpoint. {@code vaultId}/{@code vaultName}
	 * identify the source estate so assets received from several estates stay distinguishable.
	 *
	 * Các trường còn lại: {@code assetId} mã công khai tài sản, {@code name}, {@code assetType}, {@code description}, {@code allocationNote} ghi chú phân bổ,
	 * {@code deliveredAt} thời điểm bàn giao, {@code status} ({@code DELIVERED} hoặc {@code VERIFIED_BY_BENEFICIARY}), {@code imageCount} số ảnh và
	 * {@code hasContent} có nội dung mã hóa hay không.
	 */
	public record Item(UUID itemId, UUID assetId, UUID vaultId, String vaultName, String name, String assetType,
			String description, String allocationNote, Instant deliveredAt, String status, int imageCount, boolean hasContent) { }

	/**
	 * Nội dung tài sản đã giải mã: {@code itemId}, {@code assetId} và {@code payload}; {@code toString} che payload.
	 */
	public record Content(UUID itemId, UUID assetId, String payload) {
		@Override public String toString() { return "Content[itemId=" + itemId + ", payload=***]"; }
	}

	/**
	 * Metadata một ảnh: {@code id}, {@code fileName}, {@code contentType}, {@code sizeBytes}, {@code createdAt}.
	 */
	public record Image(UUID id, String fileName, String contentType, long sizeBytes, Instant createdAt) { }

	/**
	 * Ảnh đã giải mã để trả về dưới dạng byte: {@code content} là dữ liệu ảnh, {@code contentType} là MIME type; không được ghi log.
	 */
	public record ImageFile(byte[] content, String contentType) { }
}
