package com.legacyvault.admin;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@PreAuthorize("hasRole('ADMIN')")
public class AdminOverviewService {
    private final JdbcTemplate jdbc;
    public AdminOverviewService(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    @Transactional(readOnly=true, timeout=15)
    public AdminOverview overview() {
        Instant startedAt=databaseTime();
        // Independent aggregates avoid multiplying users by roles, vaults or cases.
        long accounts=count("SELECT COUNT_BIG(*) FROM dbo.users WHERE deleted_at IS NULL");
        long vaults=count("SELECT COUNT_BIG(*) FROM dbo.vaults WHERE status <> 'ARCHIVED'");
        long cases=count("SELECT COUNT_BIG(*) FROM dbo.verification_cases WHERE status='OPEN'");
        Map<String,Long> roles=new LinkedHashMap<>();
        jdbc.query("""
            SELECT r.role_code, COUNT_BIG(u.user_id) AS total
            FROM dbo.roles r LEFT JOIN dbo.user_roles ur ON ur.role_id=r.role_id
            LEFT JOIN dbo.users u ON u.user_id=ur.user_id AND u.deleted_at IS NULL
            GROUP BY r.role_code ORDER BY r.role_code
            """,rs->{roles.put(rs.getString("role_code"),rs.getLong("total"));});
        return new AdminOverview(accounts,vaults,cases,Collections.unmodifiableMap(roles),startedAt,databaseTime(),"READ_COMMITTED_COLLECTION_WINDOW");
    }
    private long count(String sql) {return jdbc.queryForObject(sql,Long.class);}
    private Instant databaseTime() {
        return jdbc.queryForObject("SELECT SYSUTCDATETIME()",(rs,n)->rs.getObject(1,java.time.LocalDateTime.class).toInstant(java.time.ZoneOffset.UTC));
    }
}
