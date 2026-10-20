package com.legacyvault.verification;

import com.legacyvault.admin.*;
import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class AdminAuditSqlServerTest extends LegalBasisSqlServerSupport {
    private <T> T admin(java.util.function.Supplier<T> read) {
        var security=SecurityContextHolder.createEmptyContext();security.setAuthentication(new UsernamePasswordAuthenticationToken("fixture",null,List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));SecurityContextHolder.setContext(security);
        try{return read.get();}finally{SecurityContextHolder.clearContext();}
    }
    private AdminAuditService service(){return context.getBean(AdminAuditService.class);}
    private UUID event(Long actor,String kind,String action,String time) {
        String id=jdbc.queryForObject("""
            INSERT dbo.audit_logs(actor_user_id,actor_type,action,entity_type,occurred_at,details,ip_address,state_before,state_after,trace_id)
            OUTPUT CONVERT(varchar(36),inserted.public_id)
            VALUES(?,?,?,'USER',?,N'{"password":"FAKE_SECRET","token":"FAKE_TOKEN","CCCD":"FAKE_ID","nested":{"content":"PRIVATE_PAYLOAD"}}','192.0.2.1',N'{"status":"PRIVATE_STATE"}',N'{"status":"PRIVATE_STATE"}',NEWID())
            """,String.class,actor,kind,action,time);
        return UUID.fromString(id);
    }
    @Test void utcFiltersStablePaginationSystemDeletedAndUnknownActors() {
        var f=fixture(false);
        UUID a=event(f.userId(),"USER","VAULT_CREATED","2025-01-01T00:00:00");
        UUID b=event(null,"SYSTEM","VAULT_CREATED","2025-01-01T00:00:00");
        UUID c=event(null,"USER","VAULT_CREATED","2025-01-01T00:01:00");
        var result=admin(()->service().list("2025-01-01T00:00:00Z","2025-01-01T00:01:00Z","VAULT_CREATED",null,null,0,1));
        assertEquals(2,result.totalElements());assertEquals(2,result.totalPages());assertEquals(b,result.content().getFirst().id());
        assertEquals(a,admin(()->service().list("2025-01-01T07:00:00+07:00","2025-01-01T07:01:00+07:00","VAULT_CREATED",null,null,1,1)).content().getFirst().id());
        assertEquals("SYSTEM",admin(()->service().detail(b)).event().actor().kind());assertNull(admin(()->service().detail(b)).event().actor().userId());
        assertEquals("UNKNOWN",admin(()->service().detail(c)).event().actor().kind());
        jdbc.update("UPDATE dbo.users SET deleted_at=SYSUTCDATETIME() WHERE user_id=?",f.userId());
        var deleted=admin(()->service().list(null,null,"VAULT_CREATED",f.legal().publicId(),"DELETED_USER",0,20));
        assertEquals(1,deleted.totalElements());assertEquals(a,deleted.content().getFirst().id());assertEquals(f.legal().publicId(),deleted.content().getFirst().actor().userId());
        assertTrue(admin(()->service().list(null,null,null,null,null,Integer.MAX_VALUE,100)).content().isEmpty());
    }
    @Test void missingPhysicalActorIsNotDroppedByJoin() {
        // Isolated fixture only: represent historical/imported orphan actor, then restore FK enforcement for future writes.
        jdbc.execute("ALTER TABLE dbo.audit_logs NOCHECK CONSTRAINT FK_audit_logs_actor");UUID id;
        try{id=event(9999999L,"USER","AUTH_LOGIN_FAILED","2024-01-01T00:00:00");}
        finally{jdbc.execute("ALTER TABLE dbo.audit_logs CHECK CONSTRAINT FK_audit_logs_actor");}
        var detail=admin(()->service().detail(id));assertEquals("DELETED_USER",detail.event().actor().kind());assertNull(detail.event().actor().userId());
    }
    @Test void unknownLabelsAndRawSensitiveColumnsNeverLeaveWhitelist() throws Exception {
        UUID id=event(null,null,"FAKE_SECRET_ACTION","2024-02-01T00:00:00");
        var f=fixture(false);jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_ADMIN'",f.userId());
        String token=context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(),f.legal().email(),List.of("ROLE_ADMIN"));
        var response=http("GET","/"+id,token);assertEquals(200,response.statusCode());
        assertTrue(response.headers().firstValue("Cache-Control").orElse("").contains("no-store"));
        assertTrue(response.body().contains("LEGACY_EVENT"));
        for(String secret:List.of("FAKE_SECRET","FAKE_TOKEN","FAKE_ID","PRIVATE_PAYLOAD","PRIVATE_STATE","192.0.2.1","password","details","stateBefore","actorUserId","entityId")) assertFalse(response.body().contains(secret));
        assertNotNull(admin(()->service().detail(id)).traceId());
        assertTrue(admin(()->service().list(null,null,"LEGACY_EVENT",null,null,0,20)).content().stream().anyMatch(x->x.id().equals(id)));
    }
    @Test void invalidFiltersAndUnknownPublicIdsFailClosed() {
        for(String bad:List.of("bad","2025-01-01","10000-01-01T00:00:00Z")) assertThrows(BusinessException.class,()->admin(()->service().list(bad,null,null,null,null,0,20)));
        assertThrows(BusinessException.class,()->admin(()->service().list("2025-01-02T00:00:00Z","2025-01-01T00:00:00Z",null,null,null,0,20)));
        assertThrows(BusinessException.class,()->admin(()->service().list(null,null,"DROP TABLE",null,null,0,20)));
        assertThrows(BusinessException.class,()->admin(()->service().list(null,null,null,null,"INVALID",0,20)));
        assertThrows(BusinessException.class,()->admin(()->service().list(null,null,null,null,null,-1,20)));
        assertThrows(BusinessException.class,()->admin(()->service().list(null,null,null,null,null,0,101)));
        assertThrows(BusinessException.class,()->admin(()->service().detail(UUID.randomUUID())));
    }
    @Test void realHttpAuthAndReadOnlyRoutesPreserveAppendOnlyEvents() throws Exception {
        var f=fixture(false);UUID id=event(f.userId(),"USER","AUTH_LOGIN_SUCCEEDED","2024-03-01T00:00:00");
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_ADMIN'",f.userId());
        String token=context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(),f.legal().email(),List.of("ROLE_ADMIN"));
        assertEquals(401,http("GET","",null).statusCode());assertEquals(200,http("GET","?size=1",token).statusCode());
        assertEquals(404,http("GET","/"+UUID.randomUUID(),token).statusCode());assertEquals(400,http("GET","/bad-id",token).statusCode());
        assertEquals(400,http("GET","?from=invalid",token).statusCode());
        assertEquals(400,http("GET","?size=0",token).statusCode());assertEquals(400,http("GET","?actorId=bad",token).statusCode());
        for(String method:List.of("PUT","PATCH","DELETE","POST")) assertEquals(405,http(method,"/"+id,token).statusCode());
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE dbo.audit_logs SET action='AUTH_LOGIN_FAILED' WHERE public_id=?",id.toString()));
        assertThrows(RuntimeException.class,()->jdbc.update("DELETE dbo.audit_logs WHERE public_id=?",id.toString()));
        jdbc.update("DELETE dbo.user_roles WHERE user_id=?",f.userId());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code<>'ROLE_ADMIN'",f.userId());
        assertEquals(403,http("GET","",token).statusCode());
        jdbc.update("UPDATE dbo.users SET status='LOCKED' WHERE user_id=?",f.userId());assertEquals(401,http("GET","/"+id,token).statusCode());
    }
    private HttpResponse<String> http(String method,String suffix,String token) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+context.getEnvironment().getProperty("local.server.port")+"/api/v1/admin/audit-logs"+suffix)).method(method,HttpRequest.BodyPublishers.noBody());
        if(token!=null) request.header("Authorization","Bearer "+token);
        return HttpClient.newHttpClient().send(request.build(),HttpResponse.BodyHandlers.ofString());
    }
}
