package com.legacyvault.beneficiary;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import com.legacyvault.common.api.PageEnvelope;

@Repository
public class GuardianRepository {
    private final JdbcTemplate jdbc;
    public GuardianRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record State(long revision, GuardianDtos.Guardian guardian) {}
    // Single statement gives one committed revision/current-record pair even during replacement.
    public State state(long beneficiary) {
        return jdbc.queryForObject("""
                SELECT b.guardian_revision, g.* FROM dbo.beneficiaries b WITH(HOLDLOCK)
                LEFT JOIN dbo.beneficiary_guardians g ON g.beneficiary_id=b.beneficiary_id AND g.ended_at IS NULL
                WHERE b.beneficiary_id=?
                """, (r,n)->new State(r.getLong("guardian_revision"),
                    r.getString("guardian_id")==null ? null : row(r)), beneficiary);
    }
    public boolean advance(long beneficiary,long expected) {
        return jdbc.update("UPDATE dbo.beneficiaries SET guardian_revision=guardian_revision+1 WHERE beneficiary_id=? AND guardian_revision=?",
                beneficiary,expected)==1;
    }
    public void end(long beneficiary,long actor,String reason) {
        jdbc.update("UPDATE dbo.beneficiary_guardians SET ended_at=SYSUTCDATETIME(),ended_by_user_id=?,end_reason=? WHERE beneficiary_id=? AND ended_at IS NULL",
                actor,reason,beneficiary);
    }
    public void insert(long beneficiary,long actor,long revision,GuardianDtos.UpsertRequest request) {
        jdbc.update("""
                INSERT dbo.beneficiary_guardians(guardian_id,beneficiary_id,revision,full_name,relationship,email,phone_number,created_by_user_id)
                VALUES(?,?,?,?,?,?,?,?)
                """,UUID.randomUUID().toString(),beneficiary,revision,request.fullName(),request.relationship(),request.email(),request.phone(),actor);
    }
    public PageEnvelope<GuardianDtos.Guardian> history(long beneficiary,int page,int size) {
        long count=jdbc.queryForObject("SELECT COUNT_BIG(*) FROM dbo.beneficiary_guardians WHERE beneficiary_id=?",Long.class,beneficiary);
        List<GuardianDtos.Guardian> rows=jdbc.query("SELECT * FROM dbo.beneficiary_guardians WHERE beneficiary_id=? ORDER BY revision DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
                (r,n)->row(r),beneficiary,(long)page*size,size);
        return new PageEnvelope<>(rows,page,size,count,(int)((count+size-1)/size));
    }
    private static GuardianDtos.Guardian row(ResultSet r) throws SQLException {
        return new GuardianDtos.Guardian(UUID.fromString(r.getString("guardian_id")),r.getLong("revision"),
                r.getString("full_name"),r.getString("relationship"),r.getString("email"),r.getString("phone_number"),
                utc(r,"created_at"),utc(r,"ended_at"),r.getString("end_reason"));
    }
    private static Instant utc(ResultSet r,String column) throws SQLException {
        LocalDateTime value=r.getObject(column,LocalDateTime.class);
        return value==null ? null : value.toInstant(ZoneOffset.UTC);
    }
}
