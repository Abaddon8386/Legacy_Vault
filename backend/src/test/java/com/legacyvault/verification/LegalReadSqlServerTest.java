package com.legacyvault.verification;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.*;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.dto.LegalReadDtos.*;
import com.legacyvault.verification.service.*;
import com.legacyvault.verification.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LegalReadSqlServerTest extends HandoverCompletionSqlSupport {
    private LegalReadService reads() {return context.getBean(LegalReadService.class);}
    private Context read(Fixture f) {return reads().context(f.legal(),f.publicCaseId());}
    private Fixture routed(ClassifyBasisRequest.Route route,boolean forwarded) {
        var f=fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(),f.legal(),new ClassifyBasisRequest(route,"Fixture basis"));
        if(route!=ClassifyBasisRequest.Route.ON_HOLD) {
            intakeVersion(f,route==ClassifyBasisRequest.Route.COURT?"COURT_JUDGMENT":"NOTARIAL_PARTITION");
            if(forwarded) context.getBean(BasisForwardService.class).forward(f.publicCaseId(),1,f.legal());
        }
        return f;
    }
    private void review(Fixture f) {context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(),f.userId(),"Fixture current review");}
    private void decide(Fixture f,LegalApprovalRequest.Decision decision) {
        var snapshot=read(f).snapshot();
        context.getBean(LegalApprovalService.class).decide(f.publicCaseId(),f.legal(),new LegalApprovalRequest(decision,snapshot.currentVersion(),snapshot.sha256Hash(),snapshot.allocationHash(),"Fixture decision"));
    }
    private void hold(Fixture f) {context.getBean(LegalBasisHoldService.class).hold(f.publicCaseId(),f.legal(),new HoldBasisRequest(HoldBasisRequest.Cause.NEW_DISPUTE,"Fixture new dispute"));}
    @Test void legacyCaseWithoutDossierAndDeathReferencesAreDiscoverableWithoutWrites() {
        var f=fixture(false);UUID death=UUID.randomUUID();
        jdbc.update("INSERT dbo.death_document_records(public_id,verification_case_id,document_type,issuing_authority,document_number,issued_date,received_by_user_id,evidence_reference) VALUES(?,?,'DEATH_CERTIFICATE','Authority','DOC-1','2026-01-01',?,'Receipt fixture')",death.toString(),f.caseId(),f.userId());
        int audit=count("audit_logs","vault_id=?",f.vaultId());
        var result=read(f);assertNull(result.basisDossier());assertNull(result.snapshot());
        assertFalse(result.capabilities().approval().allowed());assertFalse(result.capabilities().unlock().allowed());
        assertEquals(death,result.deathDocuments().getFirst().id());assertTrue(result.willComparison().wills().isEmpty());
        assertEquals(audit,count("audit_logs","vault_id=?",f.vaultId()));assertEquals(0,count("legal_basis_dossiers","verification_case_id=?",f.caseId()));
    }
    @Test void queuePaginatesFiltersAndKeepsExistingGlobalLegalScopeAcrossStaffAssignments() {
        var a=routed(ClassifyBasisRequest.Route.COURT,false);var b=routed(ClassifyBasisRequest.Route.COURT,false);
        var held=routed(ClassifyBasisRequest.Route.ON_HOLD,false);
        jdbc.update("UPDATE dbo.verification_cases SET opened_at='2026-01-01T00:00:00' WHERE verification_case_id IN (?,?)",a.caseId(),b.caseId());
        var all=reads().queue(held.legal(),null,"COURT",0,100);assertTrue(all.totalElements()>=2);
        assertTrue(all.content().stream().anyMatch(x->x.caseId().equals(a.publicCaseId())));
        assertTrue(all.content().stream().anyMatch(x->x.caseId().equals(b.publicCaseId())));
        var ids=all.content().stream().map(QueueItem::caseId).toList();assertTrue(ids.indexOf(b.publicCaseId())<ids.indexOf(a.publicCaseId()));
        var page=reads().queue(held.legal(),null,"COURT",0,1);var next=reads().queue(held.legal(),null,"COURT",1,1);
        assertEquals(1,page.content().size());assertNotEquals(page.content().getFirst().caseId(),next.content().getFirst().caseId());
        var onHold=reads().queue(a.legal(),"OPEN","ON_HOLD",0,100);assertTrue(onHold.content().stream().allMatch(x->"ON_HOLD".equals(x.route())));
        assertTrue(onHold.content().stream().anyMatch(x->x.caseId().equals(held.publicCaseId())));
        assertEquals(a.publicCaseId(),reads().context(held.legal(),a.publicCaseId()).caseId());
        for(var input:List.of(new String[]{"BAD",null},new String[]{null,"BAD"},new String[]{"open",null}))
            assertEquals(ErrorCode.VALIDATION_FAILED,assertThrows(BusinessException.class,()->reads().queue(a.legal(),input[0],input[1],0,20)).getErrorCode());
        assertThrows(BusinessException.class,()->reads().queue(a.legal(),null,null,-1,20));
        assertThrows(BusinessException.class,()->reads().queue(a.legal(),null,null,0,101));
        assertTrue(reads().queue(a.legal(),null,null,100000,20).content().isEmpty());
    }
    @Test void contextReusesWillAndDossierViewsAndExposesNoSecretOrInternalIdentifiers() throws Exception {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);var result=read(f);
        assertEquals(context.getBean(WillComparisonService.class).overview(f.publicCaseId()),result.willComparison());
        assertEquals(context.getBean(BasisDossierViewService.class).forLegal(f.publicCaseId()),result.basisDossier());
        assertEquals(1,result.snapshot().currentVersion());assertFalse(result.snapshot().reviewFresh());
    }
    @Test void reviewApprovalAndUnlockAreSeparateAndReadNeverCreatesApproval() {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);
        assertFalse(read(f).capabilities().approval().allowed());review(f);
        var reviewed=read(f);assertTrue(reviewed.snapshot().reviewFresh());assertFalse(reviewed.snapshot().approvalCurrent());
        assertTrue(reviewed.capabilities().approval().allowed());assertFalse(reviewed.capabilities().unlock().allowed());
        assertEquals("LEGAL_APPROVAL_REQUIRED",reviewed.capabilities().unlock().blockedReason());
        decide(f,LegalApprovalRequest.Decision.APPROVE);
        var approved=read(f);assertTrue(approved.snapshot().approvalCurrent());assertTrue(approved.capabilities().unlock().allowed());
        assertEquals("LEGAL_BASIS_VERIFICATION",approved.vaultStatus());assertEquals("LEGAL_APPROVED",approved.snapshot().latestDecision().result());
        context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(),f.legal());
        assertEquals("UNLOCKED",read(f).vaultStatus());assertFalse(read(f).capabilities().unlock().allowed());
    }
    @Test void rejectedApprovalNeverUnlocksButCurrentSnapshotCanBeReviewedAgain() {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);review(f);decide(f,LegalApprovalRequest.Decision.REJECT);
        var r=read(f);assertFalse(r.snapshot().approvalCurrent());assertEquals("LEGAL_REJECTED",r.snapshot().latestDecision().result());
        assertFalse(r.capabilities().unlock().allowed());assertTrue(r.capabilities().approval().allowed());
    }
    @Test void courtRequiresCurrentValidDecisionForUnlock() {
        var f=routed(ClassifyBasisRequest.Route.COURT,true);review(f);decide(f,LegalApprovalRequest.Decision.APPROVE);
        assertFalse(read(f).capabilities().unlock().allowed());assertEquals("COURT_DECISION_REQUIRED",read(f).capabilities().unlock().blockedReason());
        context.getBean(CourtDecisionService.class).record(f.publicCaseId(),f.legal(),new CourtDecisionRequest(1,CourtDecisionRequest.Result.VALID,"Fixture assessed court"));
        assertEquals("VALID",read(f).snapshot().courtResult());assertTrue(read(f).capabilities().unlock().allowed());
    }
    @Test void holdAndNewVersionInvalidateReadCapabilityAndOldMutationSnapshot() {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);review(f);decide(f,LegalApprovalRequest.Decision.APPROVE);
        var old=read(f);hold(f);var held=read(f);
        assertEquals("LEGAL_WORKFLOW_ON_HOLD",held.capabilities().unlock().blockedReason());assertFalse(held.snapshot().approvalCurrent());
        assertEquals(2,held.snapshot().requiredVersion());assertNotNull(held.snapshot().latestDecision());
        context.getBean(BasisReclassificationService.class).reclassify(f.publicCaseId(),f.legal(),new ClassifyBasisRequest(ClassifyBasisRequest.Route.NOTARIAL,"Fixture resumed"));
        intakeVersion(f,"NOTARIAL_PARTITION");context.getBean(BasisForwardService.class).forward(f.publicCaseId(),2,f.legal());
        assertEquals(2,read(f).snapshot().currentVersion());assertFalse(read(f).snapshot().approvalCurrent());
        assertThrows(BusinessException.class,()->context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(),f.legal()));
        assertThrows(BusinessException.class,()->context.getBean(LegalApprovalService.class).decide(f.publicCaseId(),f.legal(),new LegalApprovalRequest(
            LegalApprovalRequest.Decision.APPROVE,old.snapshot().currentVersion(),old.snapshot().sha256Hash(),old.snapshot().allocationHash(),"Stale fixture")));
    }
    @Test void cancelledCaseAndLegacyDossierWithoutReviewNeverAdvertiseApproval() {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,false);
        jdbc.update("UPDATE dbo.legal_basis_dossiers SET classified_by_user_id=NULL WHERE verification_case_id=?",f.caseId());
        assertNotNull(read(f).basisDossier());assertFalse(read(f).snapshot().approvalCurrent());
        jdbc.update("UPDATE dbo.verification_cases SET status='CANCELLED',closed_at=SYSUTCDATETIME() WHERE verification_case_id=?",f.caseId());
        var r=read(f);assertEquals("CANCELLED",r.caseStatus());assertFalse(r.capabilities().approval().allowed());assertFalse(r.capabilities().unlock().allowed());
    }
    @Test void contextRefreshesCachedStateAfterConcurrentHold() throws Exception {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);review(f);decide(f,LegalApprovalRequest.Decision.APPROVE);
        tx.executeWithoutResult(status->{
            var cached=context.getBean(LegalBasisDossierRepository.class).findByVerificationCaseId(f.caseId()).orElseThrow();
            assertEquals("NOTARIAL",cached.getRoute());
            try(var pool=Executors.newSingleThreadExecutor()) {pool.submit(()->hold(f)).get(10,TimeUnit.SECONDS);}
            catch(Exception e) {throw new IllegalStateException(e);}
            assertEquals("ON_HOLD",read(f).basisDossier().route());assertFalse(read(f).capabilities().unlock().allowed());
        });
    }
    @Test void contextWaitsForConcurrentWriterAndThenReadsCommittedHold() throws Exception {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);review(f);decide(f,LegalApprovalRequest.Decision.APPROVE);
        var written=new CountDownLatch(1);var release=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var writer=pool.submit(()->tx.executeWithoutResult(s->{hold(f);written.countDown();try {assertTrue(release.await(10,TimeUnit.SECONDS));}catch(InterruptedException e){throw new IllegalStateException(e);}}));
            assertTrue(written.await(10,TimeUnit.SECONDS));
            var reader=pool.submit(()->read(f));
            try {assertThrows(TimeoutException.class,()->reader.get(250,TimeUnit.MILLISECONDS));}
            finally {release.countDown();}
            writer.get(15,TimeUnit.SECONDS);assertEquals("ON_HOLD",reader.get(15,TimeUnit.SECONDS).vaultStatus());
        } finally {release.countDown();}
    }
    @Test void mvcAuthorizationPaginationAndNotFoundUseSharedContract() throws Exception {
        var f=fixture(false);
        var mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).build();
        String root="/api/v1/legal-verifications/verification-cases";
        mvc.perform(get(root)).andExpect(status().isUnauthorized());
        for(String role:List.of("ROLE_ADMIN","ROLE_STAFF_EXECUTOR","ROLE_VAULT_OWNER","ROLE_BENEFICIARY")) {
            var auth=UsernamePasswordAuthenticationToken.authenticated(f.legal(),null,List.of(new SimpleGrantedAuthority(role)));
            mvc.perform(get(root).with(authentication(auth))).andExpect(status().isForbidden());
            mvc.perform(get(root+"/"+f.publicCaseId()+"/context").with(authentication(auth))).andExpect(status().isForbidden());
        }
        var auth=UsernamePasswordAuthenticationToken.authenticated(f.legal(),null,List.of(new SimpleGrantedAuthority("ROLE_LEGAL_VERIFIER")));
        mvc.perform(get(root).param("size","0").with(authentication(auth))).andExpect(status().isBadRequest());
        mvc.perform(get(root).param("status","INVALID").with(authentication(auth))).andExpect(status().isBadRequest());
        mvc.perform(get(root+"/"+UUID.randomUUID()+"/context").with(authentication(auth))).andExpect(status().isNotFound());
        mvc.perform(get(root+"/"+f.publicCaseId()+"/context").with(authentication(auth))).andExpect(status().isOk())
            .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.caseId").value(f.publicCaseId().toString()));
    }
    @Test void realHttpJwtUsesDatabaseRoleAndNeverReturnsSecretFields() throws Exception {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_LEGAL_VERIFIER'",f.userId());
        String token=context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(),"fixture@example.test",List.of("ROLE_LEGAL_VERIFIER"));
        int port=context.getEnvironment().getRequiredProperty("local.server.port",Integer.class);
        URI uri=URI.create("http://localhost:"+port+"/api/v1/legal-verifications/verification-cases/"+f.publicCaseId()+"/context");
        try(var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()) {
            var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).header("Authorization","Bearer "+token).GET().build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofString());assertEquals(200,response.statusCode());
            assertTrue(response.headers().firstValue("Cache-Control").orElse("").contains("no-store"));
            String body=response.body();assertTrue(body.contains(f.publicCaseId().toString()));
            for(String forbidden:List.of("passwordHash","encryptedFileContent","encryptedPayload","identityNumber","ownerUserId","verificationCaseId","legalBasisDossierId")) assertFalse(body.contains("\""+forbidden+"\""),forbidden);
            assertEquals(401,client.send(HttpRequest.newBuilder(uri).GET().build(),HttpResponse.BodyHandlers.discarding()).statusCode());
            jdbc.update("DELETE dbo.user_roles WHERE user_id=?",f.userId());
            jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_STAFF_EXECUTOR'",f.userId());
            assertEquals(403,client.send(request,HttpResponse.BodyHandlers.discarding()).statusCode());
        }
    }
    @Test void archivedClosedCaseRemainsReadableButHasNoMutationCapabilities() {
        var r=ready(true);var f=r.f();
        context.getBean(BeneficiaryReconciliationService.class).confirm(f.publicCaseId(),r.session(),r.recipient(),new ConfirmBeneficiaryRequest("Fixture signed at counter"),f.legal());
        context.getBean(HandoverCloseService.class).close(f.publicCaseId(),r.session(),f.legal());
        context.getBean(HandoverReceiptService.class).create(f.publicCaseId(),r.session(),new CreateHandoverReceiptRequest(r.recipient(),List.of(r.asset()),null),f.legal());
        context.getBean(HandoverArchiveService.class).archive(f.publicCaseId(),r.session(),f.legal());
        var result=read(f);assertEquals("ARCHIVED",result.vaultStatus());assertEquals("CLOSED",result.caseStatus());
        assertFalse(result.capabilities().approval().allowed());assertFalse(result.capabilities().unlock().allowed());assertNotNull(result.snapshot().latestDecision());
        assertTrue(reads().queue(f.legal(),"CLOSED","COURT",0,100).content().stream().anyMatch(x->x.caseId().equals(f.publicCaseId())));
    }
    @Test void legacyApprovalWithoutVersionOrReviewerIsEvidenceOnlyAndDoesNotGrant() {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);
        jdbc.update("INSERT dbo.legal_basis_review_history(public_id,legal_basis_dossier_id,review_status,reason_code,reason) SELECT ?,legal_basis_dossier_id,'LEGAL_APPROVED','APPROVE','Legacy fixture' FROM dbo.legal_basis_dossiers WHERE verification_case_id=?",UUID.randomUUID().toString(),f.caseId());
        var result=read(f);assertNotNull(result.snapshot().latestDecision());assertNull(result.snapshot().latestDecision().versionNo());
        assertNull(result.snapshot().latestDecision().reviewedBy());assertFalse(result.snapshot().approvalCurrent());assertFalse(result.capabilities().unlock().allowed());
    }
    @Test void contextReadKeepsLocksUntilCommitBeforeConcurrentHold() throws Exception {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);review(f);decide(f,LegalApprovalRequest.Decision.APPROVE);
        var loaded=new CountDownLatch(1);var release=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var reader=pool.submit(()->tx.execute(s->{var result=read(f);loaded.countDown();try {assertTrue(release.await(10,TimeUnit.SECONDS));}catch(InterruptedException e){throw new IllegalStateException(e);}return result;}));
            assertTrue(loaded.await(10,TimeUnit.SECONDS));var writer=pool.submit(()->hold(f));
            try {assertThrows(TimeoutException.class,()->writer.get(250,TimeUnit.MILLISECONDS));}
            finally {release.countDown();}
            assertTrue(reader.get(15,TimeUnit.SECONDS).capabilities().unlock().allowed());writer.get(15,TimeUnit.SECONDS);
            assertFalse(read(f).capabilities().unlock().allowed());
        } finally {release.countDown();}
    }
    @Test void changedSnapshotMetadataNeverPermitsUnlockDespiteFreshLabel() {
        for(var change:Map.of("last_reviewed_sha256_hash","b".repeat(64),"last_reviewed_allocation_hash","c".repeat(64),"dispute_status","DISPUTED").entrySet()) {
            var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);review(f);decide(f,LegalApprovalRequest.Decision.APPROVE);
            var before=read(f);
            jdbc.update("UPDATE dbo.legal_basis_dossiers SET "+change.getKey()+"=? WHERE verification_case_id=?",change.getValue(),f.caseId());
            var result=read(f);assertEquals("FRESH",result.snapshot().reviewStatus());assertFalse(result.snapshot().reviewFresh());assertFalse(result.snapshot().approvalCurrent());
            assertEquals("LEGAL_DECISION_STALE",result.capabilities().unlock().blockedReason());
            assertEquals(before.snapshot().latestDecision().id(),result.snapshot().latestDecision().id());
            assertThrows(BusinessException.class,()->context.getBean(LegalVaultUnlockService.class).unlock(f.publicCaseId(),f.legal()));
        }
    }
    @Test void queueDoesNotInvertVaultCaseLockOrderAgainstWorkflowWriter() throws Exception {
        var f=routed(ClassifyBasisRequest.Route.NOTARIAL,true);
        var vaultLocked=new CountDownLatch(1);var continueWriter=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var writer=pool.submit(()->tx.executeWithoutResult(s->{
                context.getBean(com.legacyvault.vault.repository.VaultRepository.class).findByIdForUpdate(f.vaultId()).orElseThrow();
                // UPDLOCK alone is compatible with readers; an actual write models the workflow's X lock.
                jdbc.update("UPDATE dbo.vaults SET status='ON_HOLD' WHERE vault_id=?",f.vaultId());
                vaultLocked.countDown();try {assertTrue(continueWriter.await(10,TimeUnit.SECONDS));}catch(InterruptedException e){throw new IllegalStateException(e);}
                context.getBean(VerificationCaseRepository.class).findByIdForUpdate(f.caseId()).orElseThrow();
                jdbc.update("UPDATE dbo.verification_cases SET updated_at=SYSUTCDATETIME() WHERE verification_case_id=?",f.caseId());
            }));
            assertTrue(vaultLocked.await(10,TimeUnit.SECONDS));
            var queue=pool.submit(()->reads().queue(f.legal(),null,null,0,100));
            try {assertThrows(TimeoutException.class,()->queue.get(250,TimeUnit.MILLISECONDS));}
            finally {continueWriter.countDown();}
            writer.get(15,TimeUnit.SECONDS);assertTrue(queue.get(15,TimeUnit.SECONDS).content().stream().anyMatch(x->x.caseId().equals(f.publicCaseId())));
        } finally {continueWriter.countDown();}
    }
}
