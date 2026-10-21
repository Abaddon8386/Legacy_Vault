package com.legacyvault.verification;

import com.legacyvault.admin.*;
import com.legacyvault.auth.JwtService;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AdminOverviewSqlServerTest extends LegalBasisSqlServerSupport {
    private AdminOverview read() {
        var security=SecurityContextHolder.createEmptyContext();
        security.setAuthentication(new UsernamePasswordAuthenticationToken("fixture",null,List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
        SecurityContextHolder.setContext(security);
        try {return context.getBean(AdminOverviewService.class).overview();}
        finally {SecurityContextHolder.clearContext();}
    }
    @Test @Order(1) void emptyDatabaseReturnsRealZeroCountsAndCatalogRoles() {
        var result=read();assertEquals(0,result.totalAccounts());assertEquals(0,result.activeVaults());assertEquals(0,result.processingCases());
        assertFalse(result.roleAssignments().isEmpty());assertTrue(result.roleAssignments().values().stream().allMatch(x->x==0));
        assertFalse(result.completedAt().isBefore(result.startedAt()));
    }
    @Test @Order(2) void deletedLockedMultiRoleAndStateBoundariesMatchIndependentSql() {
        var a=fixture(false);var b=fixture(false);var c=fixture(false);
        jdbc.update("UPDATE dbo.users SET status='LOCKED' WHERE user_id=?",b.userId());
        jdbc.update("UPDATE dbo.users SET deleted_at=SYSUTCDATETIME() WHERE user_id=?",c.userId());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code IN ('ROLE_ADMIN','ROLE_VAULT_OWNER')",a.userId());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_ADMIN'",c.userId());
        jdbc.update("UPDATE dbo.verification_cases SET status='CANCELLED',closed_at=SYSUTCDATETIME() WHERE verification_case_id=?",b.caseId());
        jdbc.update("UPDATE dbo.vaults SET status='ON_HOLD' WHERE vault_id=?",b.vaultId());
        // Fixture transition only; never edits a record already archived.
        jdbc.update("UPDATE dbo.vaults SET status='ARCHIVED' WHERE vault_id=?",c.vaultId());
        var r=read();assertEquals(2,r.totalAccounts());assertEquals(2,r.activeVaults());assertEquals(2,r.processingCases());
        assertEquals(1,r.roleAssignments().get("ROLE_ADMIN"));assertEquals(1,r.roleAssignments().get("ROLE_VAULT_OWNER"));
        assertEquals(jdbc.queryForObject("SELECT COUNT_BIG(*) FROM dbo.users WHERE deleted_at IS NULL",Long.class),r.totalAccounts());
        assertEquals("READ_COMMITTED_COLLECTION_WINDOW",r.consistency());
    }
    @Test @Order(3) void realHttpRequiresCurrentAdminRoleAndActiveAccountWithoutLeakingContent() throws Exception {
        var f=fixture(false);
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_ADMIN'",f.userId());
        String token=context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(),f.legal().email(),List.of("ROLE_ADMIN"));
        var client=HttpClient.newHttpClient();
        var uri=URI.create("http://localhost:"+context.getEnvironment().getProperty("local.server.port")+"/api/v1/admin/overview");
        assertEquals(401,client.send(HttpRequest.newBuilder(uri).GET().build(),HttpResponse.BodyHandlers.ofString()).statusCode());
        var request=HttpRequest.newBuilder(uri).header("Authorization","Bearer "+token).GET().build();
        var response=client.send(request,HttpResponse.BodyHandlers.ofString());assertEquals(200,response.statusCode());
        assertTrue(response.headers().firstValue("Cache-Control").orElse("").contains("no-store"));
        for(String field:List.of("password","email","encrypted","content","userId","vaultId")) assertFalse(response.body().contains(field));
        jdbc.update("DELETE dbo.user_roles WHERE user_id=?",f.userId());
        assertEquals(403,client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode());
        jdbc.update("UPDATE dbo.users SET status='LOCKED' WHERE user_id=?",f.userId());
        assertEquals(401,client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode());
        jdbc.update("UPDATE dbo.users SET status='ACTIVE',deleted_at=SYSUTCDATETIME() WHERE user_id=?",f.userId());
        assertEquals(401,client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode());
    }
}
