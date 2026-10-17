package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;

/** Snapshot selected capacity; callers serialize mutations using the Owner row lock. */
@Repository
public class OwnerSubscriptionRepository {
    private final JdbcTemplate jdbc;
    public OwnerSubscriptionRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Optional<Plan> find(Long owner) {
        return jdbc.query("SELECT plan_code, catalog_version, purchase_price_vnd, asset_limit, storage_limit_bytes, file_limit_bytes FROM dbo.owner_subscription_entitlements WHERE owner_user_id=?",
            (r,n) -> new Plan(r.getString("plan_code"), r.getInt("catalog_version"),
                r.getLong("purchase_price_vnd"), "LIFETIME", new Limits(r.getLong("asset_limit"),
                    r.getLong("storage_limit_bytes"), r.getLong("file_limit_bytes"))), owner).stream().findFirst();
    }
    public void save(Long owner, Plan p) {
        int changed = jdbc.update("UPDATE dbo.owner_subscription_entitlements SET plan_code=?, catalog_version=?, purchase_price_vnd=?, asset_limit=?, storage_limit_bytes=?, file_limit_bytes=?, updated_at=SYSUTCDATETIME() WHERE owner_user_id=?",
            p.code(),p.version(),p.priceVnd(),p.limits().assetCount(),p.limits().storageBytes(),p.limits().fileBytes(),owner);
        if (changed == 0) jdbc.update("INSERT INTO dbo.owner_subscription_entitlements (plan_code,catalog_version,purchase_price_vnd,asset_limit,storage_limit_bytes,file_limit_bytes,owner_user_id) VALUES (?,?,?,?,?,?,?)",
            p.code(),p.version(),p.priceVnd(),p.limits().assetCount(),p.limits().storageBytes(),p.limits().fileBytes(),owner);
    }
}
