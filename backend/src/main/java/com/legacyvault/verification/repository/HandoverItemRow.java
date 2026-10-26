package com.legacyvault.verification.repository;

import java.time.LocalDateTime;
import java.util.UUID;

/** A delivery with public ids only; used to build API responses without exposing internal keys. */
public record HandoverItemRow(
        UUID itemPublicId,
        UUID sessionPublicId,
        UUID assetPublicId,
        UUID beneficiaryPublicId,
        String status,
        LocalDateTime deliveredAt,
        UUID staffPublicId
) {}
