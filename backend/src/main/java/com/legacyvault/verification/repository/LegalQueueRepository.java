package com.legacyvault.verification.repository;

import com.legacyvault.common.web.PageResponse;
import com.legacyvault.verification.dto.LegalReadDtos.QueueItem;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.ZoneOffset;
import java.util.*;

/** Same global Legal scope as LegalCaseLookupRepository, restricted to verification cases with a Vault. */
@Repository
public class LegalQueueRepository {
    private final JdbcTemplate jdbc;
    public LegalQueueRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public PageResponse<QueueItem> page(String status,String route,int page,int size) {
        // Match workflow writers' Vault -> Case -> Dossier order. Do not let the optimizer
        // hold a Case read lock while waiting for a Vault that its writer already owns.
        String from=" FROM dbo.vaults v JOIN dbo.verification_cases c ON v.vault_id=c.vault_id LEFT JOIN dbo.legal_basis_dossiers d ON d.verification_case_id=c.verification_case_id WHERE 1=1";
        var args=new ArrayList<Object>();
        if(status!=null) {from+=" AND c.status=?";args.add(status);}
        if(route!=null) {from+=" AND d.route=?";args.add(route);}
        long total=jdbc.queryForObject("SELECT COUNT_BIG(*)"+from+" OPTION (FORCE ORDER)",Long.class,args.toArray());
        args.add(Math.multiplyExact((long)page,size));args.add(size);
        var rows=jdbc.query("SELECT c.public_id AS case_uuid,c.verification_case_id,c.created_at,c.opened_at,c.status AS case_status,v.public_id AS vault_uuid,v.status AS vault_status,d.route,d.status AS dossier_status,d.review_status"+from
            +" ORDER BY c.opened_at DESC,c.verification_case_id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY OPTION (FORCE ORDER)",
            (rs,n)->new QueueItem(UUID.fromString(rs.getString("case_uuid")),
                String.format(Locale.ROOT,"HS-%04d-%06d",rs.getTimestamp("created_at").toLocalDateTime().getYear(),rs.getLong("verification_case_id")),
                UUID.fromString(rs.getString("vault_uuid")),rs.getString("case_status"),rs.getString("vault_status"),rs.getString("route"),
                rs.getString("dossier_status"),rs.getString("review_status"),rs.getTimestamp("opened_at").toLocalDateTime().toInstant(ZoneOffset.UTC)),args.toArray());
        return new PageResponse<>(rows,page,size,total,Math.toIntExact((total+size-1)/size));
    }
}
