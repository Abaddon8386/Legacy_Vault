package com.legacyvault.verification;
import com.legacyvault.auth.JwtService;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.service.*;
import com.legacyvault.vault.repository.VaultRepository;
import org.junit.jupiter.api.Test;
import java.net.*;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
class LegalReviewSnapshotSqlServerTest extends LegalBasisSqlServerSupport {
    private Fixture forwarded() {
        var f=fixture(false);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(),f.legal(),new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT,"Fixture court"));
        intakeVersion(f,"COURT_JUDGMENT");context.getBean(BasisForwardService.class).forward(f.publicCaseId(),1,f.legal());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_LEGAL_VERIFIER'",f.userId());return f;
    }
    private CompleteLegalBasisReviewRequest snapshot(Fixture f) {
        var s=context.getBean(LegalReadService.class).context(f.legal(),f.publicCaseId()).snapshot();
        return new CompleteLegalBasisReviewRequest("Viewed exact snapshot",s.currentVersion(),s.sha256Hash(),s.allocationHash(),s.disputeStatus());
    }
    private void newVersion(Fixture f) {
        context.getBean(LegalBasisReviewService.class).requestSupplementationByCasePublicId(f.publicCaseId(),f.userId(),"Fixture new basis");
        intakeVersion(f,"COURT_JUDGMENT");context.getBean(BasisForwardService.class).forward(f.publicCaseId(),2,f.legal());
    }
    private HttpResponse<String> post(Fixture f,Object body) throws Exception {
        String token=context.getBean(JwtService.class).generateAccessToken(f.legal().publicId(),f.legal().email(),List.of("ROLE_LEGAL_VERIFIER"));
        String json=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(body);
        return HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://localhost:"+context.getEnvironment().getProperty("local.server.port")+"/api/v1/legal-verifications/verification-cases/"+f.publicCaseId()+"/basis-dossier/review")).header("Authorization","Bearer "+token).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json)).build(),HttpResponse.BodyHandlers.ofString());
    }
    private int fresh(Fixture f) {return count("legal_basis_review_history","legal_basis_dossier_id IN (SELECT legal_basis_dossier_id FROM dbo.legal_basis_dossiers WHERE verification_case_id=?) AND review_status='FRESH'",f.caseId());}
    @Test void staleHttpReviewMustNotAttestNewVersionNeverViewedByLegal() throws Exception {
        var f=forwarded();var old=snapshot(f);newVersion(f);
        int audits=count("audit_logs","vault_id=?",f.vaultId());
        assertEquals(409,post(f,old).statusCode());assertEquals(0,fresh(f));assertEquals(audits,count("audit_logs","vault_id=?",f.vaultId()));
    }
    @Test void exactSnapshotSucceedsButLegacyReasonOnlyRequestFailsClosed() throws Exception {
        var f=forwarded();assertEquals(400,post(f,Map.of("reason","Legacy client without snapshot")).statusCode());assertEquals(0,fresh(f));
        assertEquals(200,post(f,snapshot(f)).statusCode());assertEquals(1,fresh(f));
    }
    @Test void sameVersionWrongEvidenceAllocationOrDisputeCannotBeReviewed() throws Exception {
        var f=forwarded();var s=snapshot(f);
        for(var bad:List.of(new CompleteLegalBasisReviewRequest(s.reason(),s.versionNo(),"a".repeat(64),s.allocationHash(),s.disputeStatus()),
            new CompleteLegalBasisReviewRequest(s.reason(),s.versionNo(),s.sha256Hash(),"b".repeat(64),s.disputeStatus()),
            new CompleteLegalBasisReviewRequest(s.reason(),s.versionNo(),s.sha256Hash(),s.allocationHash(),"NONE"))) assertEquals(409,post(f,bad).statusCode());
        assertEquals(0,fresh(f));
    }
    @Test void reviewWaitsForConcurrentWriterAndRejectsOldSnapshotAfterCommit() throws Exception {
        var f=forwarded();var old=snapshot(f);var changed=new CountDownLatch(1);var release=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var writer=pool.submit(()->tx.executeWithoutResult(t->{newVersion(f);changed.countDown();await(release);}));
            assertTrue(changed.await(10,TimeUnit.SECONDS));var reviewer=pool.submit(()->post(f,old));
            try {assertThrows(TimeoutException.class,()->reviewer.get(300,TimeUnit.MILLISECONDS));}finally{release.countDown();}
            writer.get(15,TimeUnit.SECONDS);assertEquals(409,reviewer.get(15,TimeUnit.SECONDS).statusCode());assertEquals(0,fresh(f));
        } finally {release.countDown();}
    }
    @Test void reviewWinningFirstIsInvalidatedByLaterBasisVersion() throws Exception {
        var f=forwarded();var old=snapshot(f);var reviewed=new CountDownLatch(1);var release=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var reviewer=pool.submit(()->tx.executeWithoutResult(t->{
                context.getBean(VaultRepository.class).findByIdForUpdate(f.vaultId()).orElseThrow();
                context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(),f.userId(),old);
                reviewed.countDown();await(release);
            }));
            assertTrue(reviewed.await(10,TimeUnit.SECONDS));var writer=pool.submit(()->newVersion(f));
            try {assertThrows(TimeoutException.class,()->writer.get(300,TimeUnit.MILLISECONDS));}finally{release.countDown();}
            reviewer.get(15,TimeUnit.SECONDS);writer.get(15,TimeUnit.SECONDS);
            var s=context.getBean(LegalReadService.class).context(f.legal(),f.publicCaseId()).snapshot();
            assertEquals(2,s.currentVersion());assertFalse(s.reviewFresh());assertFalse(s.approvalCurrent());assertEquals(1,fresh(f));
        } finally {release.countDown();}
    }
    @Test void auditFailureRollsBackSnapshotAndFreshHistoryTogether() {
        var f=forwarded();var s=snapshot(f);int audits=count("audit_logs","vault_id=?",f.vaultId());
        jdbc.execute("CREATE TRIGGER dbo.TR_test_review_audit_failure ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='LEGAL_BASIS_REVIEW_RECORDED') THROW 51090,'Fixture review audit failure',1; END");
        try {assertThrows(RuntimeException.class,()->context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(f.publicCaseId(),f.userId(),s));}
        finally {jdbc.execute("DROP TRIGGER dbo.TR_test_review_audit_failure");}
        assertEquals(0,fresh(f));assertEquals(audits,count("audit_logs","vault_id=?",f.vaultId()));
        assertFalse(context.getBean(LegalReadService.class).context(f.legal(),f.publicCaseId()).snapshot().reviewFresh());
    }
    private static void await(CountDownLatch latch) {try {assertTrue(latch.await(15,TimeUnit.SECONDS));}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}}
}
