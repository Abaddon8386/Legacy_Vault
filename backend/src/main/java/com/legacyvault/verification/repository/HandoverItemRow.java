package com.legacyvault.verification.repository;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A delivery with public ids only; used to build API responses without exposing internal keys.
 *
 * Các trường: UUID công khai của mục, phiên, tài sản, người thụ hưởng, {@code status}, {@code deliveredAt}, UUID Staff giao.
 */
public record HandoverItemRow(
        UUID itemPublicId,
        UUID sessionPublicId,
        UUID assetPublicId,
        UUID beneficiaryPublicId,
        String status,
        LocalDateTime deliveredAt,
        UUID staffPublicId
) {}
