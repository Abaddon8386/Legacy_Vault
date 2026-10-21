package com.legacyvault.verification;
import com.legacyvault.auth.JwtService;
import com.legacyvault.verification.service.BasisForwardService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import java.net.*;
import java.net.http.*;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
/** Activated on the verification branch when all four PRs are present; no fixture fallback in production. */
@EnabledIf("featuresPresent")
class FourPrIntegrationSqlServerTest extends LegalBasisSqlServerSupport {
    static boolean featuresPresent() {
        try {
            Class.forName("com.legacyvault.admin.AdminOverviewService");Class.forName("com.legacyvault.admin.AdminAuditService");Class.forName("com.legacyvault.verification.service.LegalReadService");
            return Arrays.stream(Class.forName("com.legacyvault.dms.DmsDtos$ConfigureRequest").getRecordComponents()).anyMatch(x->x.getName().equals("checkIntervalMinutes"));
        } catch(ClassNotFoundException e) {return false;}
    }
    @Test void minuteDmsCourtSnapshotApprovalOverviewAndRedactedAuditWorkTogetherWithCurrentRoles() throws Exception {
        var f=fixture(false);
        // Preverified case fixture; physical death/counter evidence is not being asserted by this test.
        jdbc.update("UPDATE dbo.vaults SET status='ACTIVE' WHERE vault_id=?",f.vaultId());
        jdbc.update("INSERT dbo.beneficiaries(vault_id,full_name) VALUES(?,'DMS trial fixture')",f.vaultId());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code IN ('ROLE_ADMIN','ROLE_VAULT_OWNER','ROLE_LEGAL_VERIFIER','ROLE_STAFF_EXECUTOR')",f.userId());
        String token=context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(),f.legal().email(),List.of("ROLE_ADMIN","ROLE_VAULT_OWNER","ROLE_LEGAL_VERIFIER","ROLE_STAFF_EXECUTOR"));
        Map<?,?> configured=call("PUT","/dms",Map.of("checkIntervalMinutes",90),token,200);
        assertEquals(90,((Number)configured.get("checkIntervalMinutes")).intValue());assertNull(configured.get("checkIntervalDays"));
        var check=call("POST","/dms/check-in",null,token,200);
        assertEquals(5400,java.time.Duration.between(Instant.parse((String)check.get("lastCheckInAt")),Instant.parse((String)check.get("nextCheckAt"))).toSeconds());
        assertEquals("ACTIVE",jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?",String.class,f.vaultId()));
        jdbc.update("UPDATE dbo.vaults SET status='DOCUMENT_VERIFICATION' WHERE vault_id=?",f.vaultId());
        String legal="/legal-verifications/verification-cases/"+f.publicCaseId();
        call("POST",legal+"/basis-dossier",Map.of("route","COURT","routeReason","Fixture court allocation"),token,201);
        intakeVersion(f,"COURT_JUDGMENT");context.getBean(BasisForwardService.class).forward(f.publicCaseId(),1,f.legal());
        var ctx=call("GET",legal+"/context",null,token,200);var snapshot=(Map<?,?>)ctx.get("snapshot");
        Map<String,Object> review=Map.of("reason","Viewed exact fixture","versionNo",snapshot.get("currentVersion"),"sha256Hash",snapshot.get("sha256Hash"),"allocationHash",snapshot.get("allocationHash"),"disputeStatus",snapshot.get("disputeStatus"));
        call("POST",legal+"/basis-dossier/review",review,token,200);
        call("POST",legal+"/basis-dossier/court-decisions",Map.of("version",1,"result","VALID","reason","Fixture current court"),token,201);
        call("POST",legal+"/basis-dossier/decision",Map.of("decision","APPROVE","versionNo",1,"sha256Hash",snapshot.get("sha256Hash"),"allocationHash",snapshot.get("allocationHash"),"reason","Fixture final approval"),token,200);
        assertEquals("LEGAL_BASIS_VERIFICATION",jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?",String.class,f.vaultId()));
        call("POST",legal+"/unlock",null,token,200);assertEquals("UNLOCKED",jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?",String.class,f.vaultId()));
        var overview=call("GET","/admin/overview",null,token,200);
        assertEquals(jdbc.queryForObject("SELECT COUNT_BIG(*) FROM dbo.users WHERE deleted_at IS NULL",Long.class),((Number)overview.get("totalAccounts")).longValue());
        assertEquals(jdbc.queryForObject("SELECT COUNT_BIG(*) FROM dbo.verification_cases WHERE status='OPEN'",Long.class),((Number)overview.get("processingCases")).longValue());
        var audits=call("GET","/admin/audit-logs?size=100&actorId="+f.legal().publicId(),null,token,200);
        var events=(List<?>)audits.get("content");var actions=events.stream().map(x->((Map<?,?>)x).get("action")).toList();
        for(String action:List.of("DMS_CONFIGURED","DMS_CHECKED_IN","LEGAL_BASIS_REVIEW_RECORDED","LEGAL_BASIS_DECIDED"))assertTrue(actions.contains(action));
        for(Object event:events) {var e=(Map<?,?>)event;assertNotNull(UUID.fromString((String)e.get("id")));assertFalse(e.containsKey("details"));assertFalse(e.containsKey("sha256Hash"));}
        assertEquals(0,count("will_comparisons","verification_case_id=?",f.caseId()),"Court path must not synthesize MATCH");
        jdbc.update("DELETE dbo.user_roles WHERE user_id=? AND role_id IN (SELECT role_id FROM dbo.roles WHERE role_code IN ('ROLE_LEGAL_VERIFIER','ROLE_VAULT_OWNER'))",f.userId());
        call("GET",legal+"/context",null,token,403);call("GET","/dms",null,token,403);call("GET","/admin/overview",null,token,200);
    }
    private Map<?,?> call(String method,String path,Object body,String token,int expected) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+context.getEnvironment().getProperty("local.server.port")+"/api/v1"+path)).header("Authorization","Bearer "+token);
        var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
        if(body==null)request.method(method,HttpRequest.BodyPublishers.noBody());else request.header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        var response=HttpClient.newHttpClient().send(request.build(),HttpResponse.BodyHandlers.ofString());assertEquals(expected,response.statusCode(),response.body());return mapper.readValue(response.body(),Map.class);
    }
}
