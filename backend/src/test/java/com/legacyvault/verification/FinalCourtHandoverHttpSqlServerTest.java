package com.legacyvault.verification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.auth.JwtService;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.verification.service.BasisForwardService;
import org.junit.jupiter.api.Test;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real HTTP + SQL in an isolated disposable DB. Death/counter identity are preverified synthetic fixtures.
 * No external email or physical/legal document authenticity is asserted. */
class FinalCourtHandoverHttpSqlServerTest extends LegalBasisSqlServerSupport {
    private final ObjectMapper json=new ObjectMapper();
    private JsonNode call(String method,String path,Object body,String token,int status) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+context.getEnvironment().getProperty("local.server.port")+"/api/v1"+path));
        if(token!=null)request.header("Authorization","Bearer "+token);
        if(body==null)request.method(method,HttpRequest.BodyPublishers.noBody());
        else request.header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        var response=HttpClient.newHttpClient().send(request.build(),HttpResponse.BodyHandlers.ofString());
        assertEquals(status,response.statusCode(),method+" "+path+": "+response.body());
        return json.readTree(response.body());
    }
    @Test void courtApprovalUnlockCounterLinkDeliveryConfirmationCloseReceiptArchiveAndReadAgain() throws Exception {
        var f=fixture(false);
        jdbc.update("UPDATE dbo.vaults SET status='DOCUMENT_VERIFICATION' WHERE vault_id=?",f.vaultId());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code IN ('ROLE_LEGAL_VERIFIER','ROLE_STAFF_EXECUTOR')",f.userId());
        String staff=context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(),f.legal().email(),List.of("ROLE_LEGAL_VERIFIER","ROLE_STAFF_EXECUTOR"));
        String legal="/legal-verifications/verification-cases/"+f.publicCaseId();
        call("POST",legal+"/basis-dossier",Map.of("route","COURT","routeReason","Synthetic court record"),staff,201);
        intakeVersion(f,"COURT_JUDGMENT");
        // Setup only the intake file in the fixture; all subsequent workflow mutations use HTTP.
        context.getBean(BasisForwardService.class).forward(f.publicCaseId(),1,f.legal());
        var snapshot=call("GET",legal+"/context",null,staff,200).get("snapshot");
        call("POST",legal+"/basis-dossier/review",Map.of("reason","Synthetic exact version","versionNo",snapshot.get("currentVersion").asInt(),"sha256Hash",snapshot.get("sha256Hash").asText(),"allocationHash",snapshot.get("allocationHash").asText(),"disputeStatus",snapshot.get("disputeStatus").asText()),staff,200);
        call("POST",legal+"/basis-dossier/court-decisions",Map.of("version",1,"result","VALID","reason","Synthetic court review"),staff,201);
        call("POST",legal+"/basis-dossier/decision",Map.of("decision","APPROVE","versionNo",1,"sha256Hash",snapshot.get("sha256Hash").asText(),"allocationHash",snapshot.get("allocationHash").asText(),"reason","Synthetic final approval"),staff,200);
        assertEquals("LEGAL_BASIS_VERIFICATION",jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?",String.class,f.vaultId()));
        call("POST",legal+"/unlock",null,staff,200);
        String recipient=jdbc.queryForObject("SELECT CAST(public_id AS varchar(36)) FROM dbo.beneficiaries WHERE vault_id=?",String.class,f.vaultId());
        long assetId=jdbc.queryForObject("SELECT asset_id FROM dbo.assets WHERE vault_id=?",Long.class,f.vaultId());
        var repo=context.getBean(AssetRepository.class);
        tx.execute(status->{var asset=repo.findById(assetId).orElseThrow();asset.setEncryptedPayload(context.getBean(EncryptionService.class).encrypt("synthetic received content",AssetService.associatedData(asset)));repo.saveAndFlush(asset);return null;});
        String asset=jdbc.queryForObject("SELECT CAST(public_id AS varchar(36)) FROM dbo.assets WHERE asset_id=?",String.class,assetId);
        call("POST","/staff/verification-cases/"+f.publicCaseId()+"/beneficiaries/"+recipient+"/identity-attestations",
                Map.of("evidenceReference","SYNTHETIC-IN-PERSON-ATTESTATION"),staff,201);
        String email=UUID.randomUUID()+"@example.test", password="Synthetic-Court-2026";
        call("POST","/auth/register",Map.of("fullName","Synthetic recipient","email",email,"password",password),null,201);
        call("POST","/staff/beneficiaries/"+recipient+"/account-link",Map.of("accountEmail",email),staff,200);
        String beneficiary=call("POST","/auth/login",Map.of("email",email,"password",password),null,200).get("accessToken").asText();
        assertEquals(0,call("GET","/received-assets",null,beneficiary,200).get("totalElements").asInt());
        String sessions="/staff/verification-cases/"+f.publicCaseId()+"/handover-sessions";
        String session=call("POST",sessions,null,staff,201).get("sessionId").asText();
        String root=sessions+"/"+session;
        var eligible=call("GET",root+"/eligible-assets",null,staff,200).get(0);
        assertEquals(jdbc.queryForObject("SELECT title FROM dbo.assets WHERE asset_id=?",String.class,assetId),eligible.get("assetName").asText());
        assertEquals(jdbc.queryForObject("SELECT full_name FROM dbo.beneficiaries WHERE vault_id=?",String.class,f.vaultId()),eligible.get("recipientName").asText());
        call("POST",root+"/close",null,staff,409);
        String item=call("POST",root+"/deliveries",Map.of("recipientId",recipient,"assetIds",List.of(asset)),staff,201).get(0).get("itemId").asText();
        assertEquals("synthetic received content",call("POST","/received-assets/"+item+"/content",Map.of("password",password),beneficiary,200).get("payload").asText());
        call("POST",root+"/beneficiaries/"+recipient+"/confirmation",Map.of("receiptReference","SYNTHETIC-COUNTER-RECEIPT"),staff,200);
        call("POST",root+"/close",null,staff,200);
        call("POST",root+"/receipts",Map.of("recipientId",recipient,"assetIds",List.of(asset)),staff,201);
        call("POST",root+"/archive",null,staff,200);
        assertEquals("ARCHIVED",jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?",String.class,f.vaultId()));
        assertEquals("CLOSED",jdbc.queryForObject("SELECT status FROM dbo.verification_cases WHERE verification_case_id=?",String.class,f.caseId()));
        assertEquals(1,call("GET","/received-assets",null,beneficiary,200).get("totalElements").asInt());
        assertEquals("synthetic received content",call("POST","/received-assets/"+item+"/content",Map.of("password",password),beneficiary,200).get("payload").asText());
        call("GET","/received-assets/"+item,null,staff,403);
    }
}
