package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.service.QuotaPolicy.Usage;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Logical bytes only. Aggregate assets and versions separately to avoid join multiplication. */
@Repository
public class OwnerUsageRepository {
    private final JdbcTemplate jdbc;

    public OwnerUsageRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /**
     * PS-92 (D-API-42): wills are stored as DOCUMENT Assets and each one occupies a slot in the Asset limit, so
     * {@link #read} counts them. This breakdown only lets clients explain that total; it never changes the limit check.
     */
    public long willCount(Long ownerUserId) {
        Long wills = jdbc.queryForObject("""
            SELECT COUNT_BIG(*) FROM dbo.assets a JOIN dbo.vaults v ON v.vault_id = a.vault_id
            WHERE v.owner_user_id = ? AND a.asset_type = 'DOCUMENT'
            """, Long.class, ownerUserId);
        return wills == null ? 0 : wills;
    }

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
