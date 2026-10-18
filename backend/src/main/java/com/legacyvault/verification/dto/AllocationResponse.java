package com.legacyvault.verification.dto;

import java.util.UUID;

/** Dòng phân bổ của một phiên bản (chỉ ID công khai). */
public record AllocationResponse(UUID assetId, UUID beneficiaryId, String description) {
}
