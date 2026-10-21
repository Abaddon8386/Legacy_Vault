package com.legacyvault.beneficiary;

import java.time.Instant;
import java.util.UUID;

/**
 * PS-104: read model of assets that Staff physically handed to the authenticated account (handover item DELIVERED or
 * VERIFIED_BY_BENEFICIARY). Public ids only; never an internal key, another recipient, an undelivered asset or content.
 */
public final class ReceivedAssetDtos {
	private ReceivedAssetDtos() { }

	/**
	 * {@code itemId} is the handover item public id and the key of every other endpoint. {@code vaultId}/{@code vaultName}
	 * identify the source estate so assets received from several estates stay distinguishable.
	 */
	public record Item(UUID itemId, UUID assetId, UUID vaultId, String vaultName, String name, String assetType,
			String description, String allocationNote, Instant deliveredAt, String status, int imageCount, boolean hasContent) { }

	public record Content(UUID itemId, UUID assetId, String payload) {
		@Override public String toString() { return "Content[itemId=" + itemId + ", payload=***]"; }
	}

	public record Image(UUID id, String fileName, String contentType, long sizeBytes, Instant createdAt) { }

	/** Decrypted image for streaming; never logged. */
	public record ImageFile(byte[] content, String contentType) { }
}
