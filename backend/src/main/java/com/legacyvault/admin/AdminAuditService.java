package com.legacyvault.admin;

import com.legacyvault.admin.AdminAuditDtos.*;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.common.error.*;
import com.legacyvault.common.web.PageResponse;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.*;
import java.time.*;
import java.util.*;

@Service
@PreAuthorize("hasRole('ADMIN')")
public class AdminAuditService {
    private static final Set<String> ENTITY_TYPES=Set.of("USER","VAULT","ASSET","ASSET_VERSION","ASSET_IMAGE","WILL","TRUSTEE","BENEFICIARY","DMS_CONFIG","VERIFICATION_CASE","DEATH_DOCUMENT_RECORD","LEGAL_VERIFICATION","WILL_COMPARISON","ORIGINAL_WILL_INTAKE","LEGAL_BASIS_DOSSIER","LEGAL_BASIS_VERSION","COURT_DECISION","HANDOVER_SESSION","HANDOVER_ITEM","HANDOVER_RECEIPT","BENEFICIARY_INVITATION","SUBSCRIPTION","SUBSCRIPTION_PLAN","SUBSCRIPTION_PAYMENT");
    private static final List<String> ACTIONS=Arrays.stream(AuditAction.values()).map(Enum::name).toList();
    private static final String ACTOR_KIND="CASE WHEN a.actor_type='SYSTEM' THEN 'SYSTEM' WHEN a.actor_user_id IS NULL THEN 'UNKNOWN' WHEN u.user_id IS NULL OR u.deleted_at IS NOT NULL THEN 'DELETED_USER' ELSE 'USER' END";
    private static final String FROM=" FROM dbo.audit_logs a LEFT JOIN dbo.users u ON u.user_id=a.actor_user_id LEFT JOIN dbo.vaults v ON v.vault_id=a.vault_id ";
    // Never SELECT details, state_before/state_after, IP, roles, names, emails or internal entity IDs.
    private static final String COLUMNS="a.public_id,a.occurred_at,a.action,a.entity_type,a.trace_id,u.public_id AS actor_public_id,v.public_id AS vault_public_id,"+ACTOR_KIND+" AS actor_kind";
    private final NamedParameterJdbcTemplate jdbc;
    public AdminAuditService(NamedParameterJdbcTemplate jdbc) {this.jdbc=jdbc;}

    @Transactional(readOnly=true,timeout=15)
    public PageResponse<Event> list(String from,String to,String action,UUID actorId,String actorKind,int page,int size) {
        if(page<0 || size<1 || size>100) throw invalid();
        Instant start=parse(from),end=parse(to);
        if(start!=null && end!=null && !start.isBefore(end)) throw invalid();
        var params=new MapSqlParameterSource();var where=new StringBuilder(" WHERE 1=1");
        if(start!=null) {where.append(" AND a.occurred_at>=:start");params.addValue("start",LocalDateTime.ofInstant(start,ZoneOffset.UTC));}
        if(end!=null) {where.append(" AND a.occurred_at<:end");params.addValue("end",LocalDateTime.ofInstant(end,ZoneOffset.UTC));}
        if(action!=null) {
            if("LEGACY_EVENT".equals(action)) {where.append(" AND a.action NOT IN (:actions)");params.addValue("actions",ACTIONS);}
            else {if(!ACTIONS.contains(action)) throw invalid();where.append(" AND a.action=:action");params.addValue("action",action);}
        }
        if(actorId!=null) {where.append(" AND u.public_id=:actor");params.addValue("actor",actorId.toString());}
        if(actorKind!=null) {
            if(!Set.of("SYSTEM","USER","DELETED_USER","UNKNOWN").contains(actorKind)) throw invalid();
            where.append(" AND ").append(ACTOR_KIND).append("=:kind");params.addValue("kind",actorKind);
        }
        long total=jdbc.queryForObject("SELECT COUNT_BIG(*)"+FROM+where,params,Long.class);
        params.addValue("offset",(long)page*size).addValue("size",size);
        var rows=jdbc.query("SELECT "+COLUMNS+FROM+where+" ORDER BY a.occurred_at DESC,a.audit_log_id DESC OFFSET :offset ROWS FETCH NEXT :size ROWS ONLY",params,(rs,n)->event(rs));
        return new PageResponse<>(rows,page,size,total,(int)Math.min(Integer.MAX_VALUE,(total+size-1)/size));
    }
    @Transactional(readOnly=true,timeout=15)
    public Detail detail(UUID id) {
        if(id==null) throw invalid();
        return jdbc.query("SELECT "+COLUMNS+FROM+" WHERE a.public_id=:id",Map.of("id",id.toString()),(rs,n)->new Detail(event(rs),uuid(rs,"trace_id"))).stream().findFirst()
            .orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }
    private Event event(ResultSet rs) throws SQLException {
        String kind=rs.getString("actor_kind"),action=rs.getString("action"),type=rs.getString("entity_type");
        return new Event(uuid(rs,"public_id"),rs.getObject("occurred_at",LocalDateTime.class).toInstant(ZoneOffset.UTC),
            new Actor(kind,"SYSTEM".equals(kind)?null:uuid(rs,"actor_public_id")),ACTIONS.contains(action)?action:"LEGACY_EVENT",ENTITY_TYPES.contains(type)?type:"OTHER",uuid(rs,"vault_public_id"));
    }
    private static UUID uuid(ResultSet rs,String column) throws SQLException {String s=rs.getString(column);return s==null?null:UUID.fromString(s);}
    private static Instant parse(String value) {
        if(value==null) return null;
        try {Instant i=Instant.parse(value);LocalDateTime dt=LocalDateTime.ofInstant(i,ZoneOffset.UTC);if(dt.getYear()<1 || dt.getYear()>9999) throw invalid();return i;}
        catch(DateTimeException e) {throw invalid();}
    }
    private static BusinessException invalid() {return new BusinessException(ErrorCode.VALIDATION_FAILED);}
}
