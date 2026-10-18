package com.legacyvault.verification.repository;

import java.util.UUID;

/** Authoritative allocation ids/public ids and approval state used to compose an immutable receipt. */
public record ReceiptAllocationRow(
        int versionNo,
        Long allocationId,
        Long assetId,
        UUID assetPublicId,
        Long beneficiaryId,
        UUID beneficiaryPublicId,
        String beneficiaryIdentityVerificationStatus,
        String status,
        String description
) {}
