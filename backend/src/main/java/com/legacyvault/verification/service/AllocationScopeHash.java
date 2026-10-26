package com.legacyvault.verification.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.Collection;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.ReceiptAllocationRow;

/** Canonical PS-57/58 allocation hash. Keep the format stable for persisted approvals. */
public final class AllocationScopeHash {
    private AllocationScopeHash() {}

    /** Preserves the existing format: public asset UUID, public beneficiary UUID, description; null is "null". */
    public static String canonicalValue(UUID assetPublicId, UUID beneficiaryPublicId, String description) {
        return String.valueOf(assetPublicId) + "|" + String.valueOf(beneficiaryPublicId) + "|"
                + String.valueOf(description);
    }

    public static String hashApprovalRows(Collection<AllocationRow> rows) {
        return hashCanonicalValues(rows.stream()
                .map(row -> canonicalValue(row.assetId(), row.beneficiaryId(), row.description())).toList());
    }

    public static String hashReceiptRows(Collection<ReceiptAllocationRow> rows) {
        return hashCanonicalValues(rows.stream()
                .map(row -> canonicalValue(row.assetPublicId(), row.beneficiaryPublicId(), row.description())).toList());
    }

    /** Preserves sorting, newline separator, UTF-8 encoding, and SHA-256 used by persisted decisions. */
    public static String hashCanonicalValues(List<String> values) {
        String canonicalScope = values.stream().sorted().collect(java.util.stream.Collectors.joining("\n"));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonicalScope.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available.", ex);
        }
    }
}
