package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Repository
public class PaymentRepository {
    private final JdbcTemplate jdbc;
    public PaymentRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Payment(UUID id,long owner,UUID key,Plan plan,String merchant,String status,
                          Instant created,Instant expires,String gatewayNo) {}
    private static final RowMapper<Payment> ROW=(rs,n)-> new Payment(UUID.fromString(rs.getString("payment_id")),
        rs.getLong("owner_user_id"),UUID.fromString(rs.getString("idempotency_key")),
        new Plan(rs.getString("plan_code"),rs.getInt("catalog_version"),rs.getLong("amount_vnd"),"LIFETIME",
            new Limits(rs.getLong("asset_limit"),rs.getLong("storage_limit_bytes"),rs.getLong("file_limit_bytes"))),
        rs.getString("merchant_code"),rs.getString("status"),
        rs.getTimestamp("created_at").toLocalDateTime().toInstant(ZoneOffset.UTC),
        rs.getTimestamp("expires_at").toLocalDateTime().toInstant(ZoneOffset.UTC),rs.getString("gateway_transaction_no"));
    public Optional<Payment> find(UUID id) {
        return jdbc.query("SELECT * FROM dbo.subscription_payments WHERE payment_id=?",ROW,id.toString()).stream().findFirst();
    }
    public Optional<Payment> byKey(long owner,UUID key) {
        return jdbc.query("SELECT * FROM dbo.subscription_payments WHERE owner_user_id=? AND idempotency_key=?",ROW,owner,key.toString()).stream().findFirst();
    }
    public boolean pending(long owner,Instant now) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.subscription_payments WHERE owner_user_id=? AND status='PENDING' AND expires_at>?",
            Integer.class,owner,utc(now))>0;
    }
    public void insert(Payment p) {
        jdbc.update("""
            INSERT dbo.subscription_payments(payment_id,owner_user_id,idempotency_key,plan_code,catalog_version,amount_vnd,
                asset_limit,storage_limit_bytes,file_limit_bytes,merchant_code,created_at,expires_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            """,p.id().toString(),p.owner(),p.key().toString(),p.plan().code(),p.plan().version(),p.plan().priceVnd(),
            p.plan().limits().assetCount(),p.plan().limits().storageBytes(),p.plan().limits().fileBytes(),p.merchant(),utc(p.created()),utc(p.expires()));
    }
    /** Lock order: User -> payment. Callback also accepts disabled/deleted owners so money is recorded. */
    public void lockOwner(long owner) {
        jdbc.queryForObject("SELECT user_id FROM dbo.users WITH(UPDLOCK,HOLDLOCK) WHERE user_id=?",Long.class,owner);
    }
    public void complete(UUID id,String status,String gatewayNo,String code,String gatewayStatus) {
        int changed=jdbc.update("UPDATE dbo.subscription_payments SET status=?,gateway_transaction_no=?,response_code=?,transaction_status=?,completed_at=SYSUTCDATETIME() WHERE payment_id=? AND status='PENDING'",
            status,gatewayNo,code,gatewayStatus,id.toString());
        if(changed!=1) throw new IllegalStateException("Payment state changed unexpectedly");
    }
    public Optional<Plan> effective(long owner) {
        return jdbc.query("""
            SELECT TOP(1) * FROM dbo.subscription_payments WHERE owner_user_id=? AND status='SUCCEEDED'
            ORDER BY CASE plan_code WHEN 'EXTENDED' THEN 2 ELSE 1 END DESC,completed_at DESC,payment_id DESC
            """,ROW,owner).stream().map(Payment::plan).findFirst();
    }
    private static Timestamp utc(Instant time) { return Timestamp.valueOf(LocalDateTime.ofInstant(time,ZoneOffset.UTC)); }
}
