package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.service.QuotaPolicy.Usage;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Đọc mức sử dụng thực tế của một Owner bằng SQL thuần (JdbcTemplate): chỉ tính byte logic. Tổng hợp riêng từng bảng để tránh nhân dòng do join. Dùng bởi {@code OwnerQuotaService} và {@code AdminSubscriptionService}.
 */
@Repository
public class OwnerUsageRepository {
    /**
     * Truy cập SQL thuần.
     */
    private final JdbcTemplate jdbc;

    /**
     * Khởi tạo với {@link JdbcTemplate}.
     */
    public OwnerUsageRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /**
     * PS-92 (D-API-42): di chúc lưu dạng Asset DOCUMENT và mỗi di chúc chiếm một suất trong giới hạn Asset, nên {@link #read} đã đếm chúng.
     * Hàm này chỉ cho client giải thích tổng; không bao giờ đổi việc kiểm tra giới hạn.
     *
     * @param ownerUserId id Owner
     * @return số Asset DOCUMENT của mọi Vault thuộc Owner
     */
    public long willCount(Long ownerUserId) {
        Long wills = jdbc.queryForObject("""
            SELECT COUNT_BIG(*) FROM dbo.assets a JOIN dbo.vaults v ON v.vault_id = a.vault_id
            WHERE v.owner_user_id = ? AND a.asset_type = 'DOCUMENT'
            """, Long.class, ownerUserId);
        return wills == null ? 0 : wills;
    }

    /**
     * Đọc mức sử dụng: số Asset ({@code assets}) và tổng byte = payload Asset + file phiên bản di chúc ({@code asset_versions}) + ảnh ({@code asset_images}) + tài liệu ({@code asset_documents}).
     * PS-114: tài liệu đính kèm chỉ tính dung lượng, không chiếm suất Asset.
     *
     * @param ownerUserId id Owner
     * @return {@link Usage}
     */
    public Usage read(Long ownerUserId) {
        Usage payloads = jdbc.queryForObject("""
            SELECT COUNT_BIG(*) AS assets, COALESCE(SUM(a.payload_size_bytes), 0) AS bytes
            FROM dbo.assets a JOIN dbo.vaults v ON v.vault_id = a.vault_id
            WHERE v.owner_user_id = ?
            """, (rs, row) -> new Usage(rs.getLong("assets"), rs.getLong("bytes")), ownerUserId);
        Long versions = jdbc.queryForObject("""
            SELECT COALESCE(SUM(av.file_size_bytes), 0)
            FROM dbo.asset_versions av
            JOIN dbo.assets a ON a.asset_id = av.asset_id
            JOIN dbo.vaults v ON v.vault_id = a.vault_id
            WHERE v.owner_user_id = ?
            """, Long.class, ownerUserId);
        Long imageBytes = jdbc.queryForObject("""
            SELECT COALESCE(SUM(i.file_size_bytes), 0) FROM dbo.asset_images i
            JOIN dbo.assets a ON a.asset_id=i.asset_id JOIN dbo.vaults v ON v.vault_id=a.vault_id
            WHERE v.owner_user_id=?
            """, Long.class, ownerUserId);
        Long documentBytes = jdbc.queryForObject("""
            SELECT COALESCE(SUM(d.file_size_bytes), 0) FROM dbo.asset_documents d
            JOIN dbo.assets a ON a.asset_id=d.asset_id JOIN dbo.vaults v ON v.vault_id=a.vault_id
            WHERE v.owner_user_id=?
            """, Long.class, ownerUserId);
        // PS-114: attached documents count toward storage only; they never occupy an Asset slot.
        return new Usage(payloads.assets(), Math.addExact(Math.addExact(Math.addExact(payloads.bytes(), versions), imageBytes), documentBytes));
    }
}
