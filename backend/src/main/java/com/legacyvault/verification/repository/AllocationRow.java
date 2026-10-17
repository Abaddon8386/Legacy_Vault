package com.legacyvault.verification.repository;

import java.util.UUID;

/** Một dòng phân bổ kèm ID công khai của tài sản và người nhận, theo số phiên bản. */
public record AllocationRow(int versionNo, UUID assetId, UUID beneficiaryId, String description) {
}
