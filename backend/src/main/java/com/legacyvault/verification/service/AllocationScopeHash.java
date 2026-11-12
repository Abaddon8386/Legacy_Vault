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

/**
 * Canonical PS-57/58 allocation hash. Keep the format stable for persisted approvals.
 *
 * <p>Tiện ích băm (SHA-256) phạm vi phân bổ tài sản cho người nhận, dùng để so khớp bản phân bổ đã được Legal duyệt
 * với bản phân bổ hiện hành (chống thay đổi sau khi duyệt) và để gắn vào biên nhận bàn giao.
 *
 * Lớp tiện ích tĩnh, không có trạng thái, không truy cập DB. Được dùng bởi {@code DistributionWorkflowService},
 * {@code BasisDossierViewService} (băm {@link AllocationRow} đã duyệt) và {@code HandoverReceiptService}
 * (băm {@link ReceiptAllocationRow}). Định dạng chuỗi chuẩn phải giữ ổn định vì hash đã được lưu trong DB.
 */
public final class AllocationScopeHash {
    /**
     * Constructor private: lớp chỉ chứa phương thức tĩnh nên không cho khởi tạo.
     */
    private AllocationScopeHash() {}

    /**
     * Preserves the existing format: public asset UUID, public beneficiary UUID, description; null is "null".
     *
     * <p>Dựng chuỗi chuẩn cho một dòng phân bổ theo dạng {@code assetPublicId|beneficiaryPublicId|description}.
     * Giá trị {@code null} được chuyển thành chuỗi {@code "null"} (qua {@code String.valueOf}).
     *
     * @param assetPublicId UUID công khai của tài sản
     * @param beneficiaryPublicId UUID công khai của người nhận
     * @param description mô tả phần được phân bổ (có thể null)
     * @return chuỗi chuẩn dùng làm đầu vào cho băm
     */
    public static String canonicalValue(UUID assetPublicId, UUID beneficiaryPublicId, String description) {
        return String.valueOf(assetPublicId) + "|" + String.valueOf(beneficiaryPublicId) + "|"
                + String.valueOf(description);
    }

    /**
     * Băm danh sách dòng phân bổ của một phiên bản hồ sơ căn cứ ({@link AllocationRow}, đọc từ bảng
     * {@code legal_basis_version_allocations}). Mỗi dòng được chuẩn hóa bằng {@link #canonicalValue} rồi gộp qua
     * {@link #hashCanonicalValues}.
     *
     * @param rows các dòng phân bổ (thứ tự không ảnh hưởng vì được sắp xếp khi băm)
     * @return chuỗi hex SHA-256
     */
    public static String hashApprovalRows(Collection<AllocationRow> rows) {
        return hashCanonicalValues(rows.stream()
                .map(row -> canonicalValue(row.assetId(), row.beneficiaryId(), row.description())).toList());
    }

    /**
     * Băm danh sách dòng phân bổ dạng {@link ReceiptAllocationRow} (dùng khi lập biên nhận bàn giao,
     * xem {@code HandoverReceiptService#create}). Cùng định dạng chuẩn với {@link #hashApprovalRows} nên hai kết quả so khớp được.
     *
     * @param rows các dòng phân bổ của phiên bản hiện hành
     * @return chuỗi hex SHA-256
     */
    public static String hashReceiptRows(Collection<ReceiptAllocationRow> rows) {
        return hashCanonicalValues(rows.stream()
                .map(row -> canonicalValue(row.assetPublicId(), row.beneficiaryPublicId(), row.description())).toList());
    }

    /**
     * Preserves sorting, newline separator, UTF-8 encoding, and SHA-256 used by persisted decisions.
     *
     * <p>Băm tập các chuỗi chuẩn: sắp xếp, nối bằng ký tự xuống dòng, mã hóa UTF-8 rồi SHA-256 và trả về dạng hex thường.
     *
     * @param values danh sách chuỗi chuẩn từ {@link #canonicalValue}
     * @return chuỗi hex SHA-256
     * @throws IllegalStateException nếu JVM không có thuật toán SHA-256 (không xảy ra trên JVM chuẩn)
     */
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
