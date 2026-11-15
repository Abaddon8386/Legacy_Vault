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

/** Hash phân bổ chuẩn PS-57/58. Giữ định dạng ổn định cho các phê duyệt đã lưu. */
public final class AllocationScopeHash {
    private AllocationScopeHash() {}

    /** Giữ định dạng hiện có: UUID công khai của tài sản, UUID công khai của người thụ hưởng, mô tả; null là "null". */
    public static String canonicalValue(UUID assetPublicId, UUID beneficiaryPublicId, String description) {
        return String.valueOf(assetPublicId) + "|" + String.valueOf(beneficiaryPublicId) + "|"
                + String.valueOf(description);
    }

    /**
     * Băm phạm vi phân bổ dùng cho phê duyệt của Legal (từ AllocationRow).
     * @param rows các dòng phân bổ hiện hành của một phiên bản
     * @return SHA-256 dạng hex, không phụ thuộc thứ tự dòng
     */
    public static String hashApprovalRows(Collection<AllocationRow> rows) {
        return hashCanonicalValues(rows.stream()
                .map(row -> canonicalValue(row.assetId(), row.beneficiaryId(), row.description())).toList());
    }

    /**
     * Băm phạm vi phân bổ từ ReceiptAllocationRow (luồng biên nhận bàn giao); dùng cùng định dạng canonical nên cho cùng hash với phê duyệt nếu phạm vi giống nhau.
     */
    public static String hashReceiptRows(Collection<ReceiptAllocationRow> rows) {
        return hashCanonicalValues(rows.stream()
                .map(row -> canonicalValue(row.assetPublicId(), row.beneficiaryPublicId(), row.description())).toList());
    }

    /** Giữ nguyên sắp xếp, dấu xuống dòng, mã hóa UTF-8 và SHA-256 mà các quyết định đã lưu dùng. */
    public static String hashCanonicalValues(List<String> values) {
        // Sắp xếp trước khi nối để hash không phụ thuộc thứ tự truy vấn; hash này được lưu cùng quyết định Legal để phát hiện phạm vi bị đổi sau khi duyệt.
        String canonicalScope = values.stream().sorted().collect(java.util.stream.Collectors.joining("\n"));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonicalScope.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available.", ex);
        }
    }
}
