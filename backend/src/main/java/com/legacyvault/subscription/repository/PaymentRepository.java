package com.legacyvault.subscription.repository;

import com.legacyvault.common.api.PageEnvelope;
import com.legacyvault.subscription.dto.AdminPaymentDtos.Transaction;
import com.legacyvault.subscription.dto.AdminPaymentDtos.Filter;
import com.legacyvault.subscription.dto.AdminSubscriptionDtos.PlanLimitsDto;
import java.sql.ResultSet;
import java.sql.SQLException;

import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/**
 * Truy cập bảng {@code dbo.subscription_payments} bằng SQL thuần: tạo / khóa / hoàn tất đơn thanh toán VNPay và truy vấn cho admin. Dùng bởi {@code PaymentService}, {@code PaymentReconciliationService}, {@code OwnerQuotaService}, {@code AdminSubscriptionService}.
 */
@Repository
public class PaymentRepository {
    /**
     * Truy cập SQL thuần.
     */
    private final JdbcTemplate jdbc;
    /**
     * Khởi tạo với {@link JdbcTemplate}.
     */
    public PaymentRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    /**
     * Một đơn thanh toán: id, id Owner ({@code owner}), khóa idempotency, snapshot gói ({@link Plan}) tại thời điểm mua, mã merchant, trạng thái (PENDING, SUCCEEDED, FAILED), thời điểm tạo / hết hạn và mã giao dịch cổng.
     */
    public record Payment(UUID id,long owner,UUID key,Plan plan,String merchant,String status,
                          Instant created,Instant expires,String gatewayNo) {}
    /**
     * Ánh xạ một dòng {@code subscription_payments} sang {@link Payment}.
     */
    private static final RowMapper<Payment> ROW=(rs,n)-> new Payment(UUID.fromString(rs.getString("payment_id")),
        rs.getLong("owner_user_id"),UUID.fromString(rs.getString("idempotency_key")),
        new Plan(rs.getString("plan_code"),rs.getInt("catalog_version"),rs.getLong("amount_vnd"),"LIFETIME",
            new Limits(rs.getLong("asset_limit"),rs.getLong("storage_limit_bytes"),rs.getLong("file_limit_bytes"))),
        rs.getString("merchant_code"),rs.getString("status"),
        rs.getTimestamp("created_at").toLocalDateTime().toInstant(ZoneOffset.UTC),
        rs.getTimestamp("expires_at").toLocalDateTime().toInstant(ZoneOffset.UTC),rs.getString("gateway_transaction_no"));
    /**
     * Tìm đơn theo payment id.
     */
    public Optional<Payment> find(UUID id) {
        return jdbc.query("SELECT * FROM dbo.subscription_payments WHERE payment_id=?",ROW,id.toString()).stream().findFirst();
    }
    /**
     * Tìm đơn theo (Owner, idempotency key) để tạo đơn idempotent.
     */
    public Optional<Payment> byKey(long owner,UUID key) {
        return jdbc.query("SELECT * FROM dbo.subscription_payments WHERE owner_user_id=? AND idempotency_key=?",ROW,owner,key.toString()).stream().findFirst();
    }
    /**
     * Owner có đơn PENDING chưa hết hạn không (mỗi Owner chỉ một đơn đang mở).
     */
    public boolean pending(long owner,Instant now) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.subscription_payments WHERE owner_user_id=? AND status='PENDING' AND expires_at>?",
            Integer.class,owner,utc(now))>0;
    }
    /**
     * Thêm đơn mới (PENDING) cùng snapshot giá và giới hạn gói.
     */
    public void insert(Payment p) {
        jdbc.update("""
            INSERT dbo.subscription_payments(payment_id,owner_user_id,idempotency_key,plan_code,catalog_version,amount_vnd,
                asset_limit,storage_limit_bytes,file_limit_bytes,merchant_code,created_at,expires_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            """,p.id().toString(),p.owner(),p.key().toString(),p.plan().code(),p.plan().version(),p.plan().priceVnd(),
            p.plan().limits().assetCount(),p.plan().limits().storageBytes(),p.plan().limits().fileBytes(),p.merchant(),utc(p.created()),utc(p.expires()));
    }
    /**
     * Khóa dòng người dùng (UPDLOCK, HOLDLOCK). Thứ tự khóa: User -> payment. Callback cũng chấp nhận Owner bị khóa / xóa để tiền luôn được ghi nhận.
     */
    public void lockOwner(long owner) {
        jdbc.queryForObject("SELECT user_id FROM dbo.users WITH(UPDLOCK,HOLDLOCK) WHERE user_id=?",Long.class,owner);
    }
    /**
     * Chốt đơn sang SUCCEEDED hoặc FAILED kèm mã giao dịch / mã phản hồi của cổng. Chỉ cập nhật đơn đang PENDING, hoặc đơn FAILED nay được xác minh SUCCEEDED; nếu không đổi được đúng 1 dòng thì ném {@link IllegalStateException}.
     */
    public void complete(UUID id,String status,String gatewayNo,String code,String gatewayStatus) {
        int changed=jdbc.update("UPDATE dbo.subscription_payments SET status=?,gateway_transaction_no=?,response_code=?,transaction_status=?,completed_at=SYSUTCDATETIME() WHERE payment_id=? AND (status='PENDING' OR (status='FAILED' AND ?='SUCCEEDED'))",
            status,gatewayNo,code,gatewayStatus,id.toString(),status);
        if(changed!=1) throw new IllegalStateException("Payment state changed unexpectedly");
    }
    /**
     * Gói hiệu lực của Owner: đơn SUCCEEDED có bậc cao nhất (EXTENDED trước), mới nhất; rỗng nếu chưa mua gì.
     */
    public Optional<Plan> effective(long owner) {
        return jdbc.query("""
            SELECT TOP(1) * FROM dbo.subscription_payments WHERE owner_user_id=? AND status='SUCCEEDED'
            ORDER BY CASE plan_code WHEN 'EXTENDED' THEN 2 ELSE 1 END DESC,completed_at DESC,payment_id DESC
            """,ROW,owner).stream().map(Payment::plan).findFirst();
    }

    /**
     * Câu SELECT chung cho API admin: ghép với bảng users để lấy account id công khai và email.
     */
    private static final String ADMIN_COLUMNS="""
        SELECT p.payment_id,u.public_id AS account_id,u.email AS account_email,p.plan_code,p.catalog_version,
            p.amount_vnd,p.asset_limit,p.storage_limit_bytes,p.file_limit_bytes,p.status,
            p.created_at,p.expires_at,p.completed_at,p.gateway_transaction_no
        FROM dbo.subscription_payments p JOIN dbo.users u ON u.user_id=p.owner_user_id
        """;

    /**
     * Danh sách giao dịch cho admin có lọc và phân trang. Bộ lọc: accountId, khoảng thời gian tạo, status (EXPIRED = PENDING đã quá hạn), query (UUID, UUID 32 hex, mã giao dịch cổng toàn số, hoặc email).
     * Query không nhận dạng được thì không trả dòng nào. Caller dùng SERIALIZABLE để đếm và phân trang nhất quán khi IPN đang đổi dữ liệu; không dùng NOLOCK.
     */
    public PageEnvelope<Transaction> adminList(
            Filter filter, Instant observedAt) {
        var args=new ArrayList<Object>();
        StringBuilder where=new StringBuilder(" WHERE 1=1");
        if(filter.accountId()!=null) {where.append(" AND u.public_id=?");args.add(filter.accountId().toString());}
        if(filter.from()!=null) {where.append(" AND p.created_at>=?");args.add(LocalDateTime.ofInstant(filter.from(),ZoneOffset.UTC));}
        if(filter.to()!=null) {where.append(" AND p.created_at<?");args.add(LocalDateTime.ofInstant(filter.to(),ZoneOffset.UTC));}
        if(filter.status()!=null) {
            if(filter.status().equals("EXPIRED")) {
                where.append(" AND p.status='PENDING' AND p.expires_at<=?");args.add(LocalDateTime.ofInstant(observedAt,ZoneOffset.UTC));
            } else if(filter.status().equals("PENDING")) {
                where.append(" AND p.status='PENDING' AND p.expires_at>?");args.add(LocalDateTime.ofInstant(observedAt,ZoneOffset.UTC));
            } else {where.append(" AND p.status=?");args.add(filter.status());}
        }
        if(filter.query()!=null) {
            String q=filter.query();
            if(q.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
                where.append(" AND (p.payment_id=? OR u.public_id=?)");args.add(q);args.add(q);
            } else if(q.matches("(?i)[0-9a-f]{32}")) {
                String id=q.replaceFirst("(.{8})(.{4})(.{4})(.{4})(.{12})","$1-$2-$3-$4-$5");
                where.append(" AND p.payment_id=?");args.add(id);
            } else if(q.matches("[0-9]{1,15}")) {
                where.append(" AND p.gateway_transaction_no=?");args.add(q);
            } else if(q.contains("@")) {
                where.append(" AND LOWER(u.email)=?");args.add(q.toLowerCase(Locale.ROOT));
            } else {where.append(" AND 1=0");}
        }
        long count=jdbc.queryForObject("SELECT COUNT_BIG(*) FROM dbo.subscription_payments p JOIN dbo.users u ON u.user_id=p.owner_user_id"+where,
                Long.class,args.toArray());
        args.add((long)filter.page()*filter.size());args.add(filter.size());
        var rows=jdbc.query(ADMIN_COLUMNS+where+" ORDER BY p.created_at DESC,p.payment_id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
                (r,n)->adminRow(r,observedAt),args.toArray());
        return new PageEnvelope<>(rows,filter.page(),filter.size(),count,(int)((count+filter.size()-1)/filter.size()));
    }
    /**
     * Chi tiết một giao dịch cho admin theo payment id.
     */
    public Optional<Transaction> adminDetail(UUID id,Instant observedAt) {
        return jdbc.query(ADMIN_COLUMNS+" WHERE p.payment_id=?",(r,n)->adminRow(r,observedAt),id.toString()).stream().findFirst();
    }
    /**
     * Ánh xạ dòng DB sang {@link Transaction}; PENDING đã qua {@code expires_at} được hiển thị là EXPIRED (trạng thái DB giữ ở {@code persistedStatus}).
     */
    private static Transaction adminRow(ResultSet r,Instant observedAt) throws SQLException {
        String persisted=r.getString("status");
        Instant expires=adminTime(r,"expires_at");
        String status="PENDING".equals(persisted) && !observedAt.isBefore(expires) ? "EXPIRED" : persisted;
        UUID id=UUID.fromString(r.getString("payment_id"));
        return new Transaction(id,UUID.fromString(r.getString("account_id")),r.getString("account_email"),
                r.getString("plan_code"),r.getInt("catalog_version"),r.getLong("amount_vnd"),"VND","LIFETIME",
                new PlanLimitsDto(r.getLong("asset_limit"),r.getLong("storage_limit_bytes"),r.getLong("file_limit_bytes")),
                status,persisted,adminTime(r,"created_at"),expires,adminTime(r,"completed_at"),r.getString("gateway_transaction_no"),id.toString().replace("-",""));
    }
    /**
     * Đọc cột thời gian (UTC) thành {@link Instant}; null nếu cột null.
     */
    private static Instant adminTime(ResultSet r,String column) throws SQLException {
        var value=r.getObject(column,LocalDateTime.class);
        return value==null ? null : value.toInstant(ZoneOffset.UTC);
    }
    /**
     * Đổi {@link Instant} sang {@link Timestamp} UTC để ghi DB.
     */
    private static Timestamp utc(Instant time) { return Timestamp.valueOf(LocalDateTime.ofInstant(time,ZoneOffset.UTC)); }
}
