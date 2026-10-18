package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.service.QuotaPolicy.Usage;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Logical bytes only. Aggregate assets and versions separately to avoid join multiplication. */
@Repository
public class OwnerUsageRepository {
    private final JdbcTemplate jdbc;

    public OwnerUsageRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

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
        return new Usage(payloads.assets(), Math.addExact(payloads.bytes(), versions));
    }
}
