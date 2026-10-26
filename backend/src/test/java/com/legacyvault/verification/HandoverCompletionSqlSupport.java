package com.legacyvault.verification;
import com.legacyvault.verification.service.*;
import com.legacyvault.verification.dto.*;
import java.util.*;
/** Real SQL fixtures; only the randomly named database owned by LegalBasisSqlServerSupport is changed. */
abstract class HandoverCompletionSqlSupport extends LegalBasisSqlServerSupport {
    static Ready ready(boolean deliver) {
        var f=fixture(true);
        context.getBean(BasisClassificationService.class).classify(f.publicCaseId(),f.legal(),
            new ClassifyBasisRequest(ClassifyBasisRequest.Route.COURT,"SQL fixture"));
        intakeVersion(f,"COURT_JUDGMENT");
        context.getBean(BasisForwardService.class).forward(f.publicCaseId(),1,f.legal());
        context.getBean(CourtDecisionService.class).record(f.publicCaseId(),f.legal(),
            new CourtDecisionRequest(1,CourtDecisionRequest.Result.VALID,"SQL fixture"));
        var review=context.getBean(LegalBasisReviewService.class).recordCompletedReviewByCasePublicId(
            f.publicCaseId(),f.userId(),"SQL fixture");
        context.getBean(LegalApprovalService.class).decide(f.publicCaseId(),f.legal(),
            new LegalApprovalRequest(LegalApprovalRequest.Decision.APPROVE,review.currentVersionNo(),
                review.currentSha256Hash(),review.currentAllocationHash(),"SQL fixture"));
        jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status='VERIFIED_AT_COUNTER' WHERE vault_id=?",f.vaultId());
        jdbc.update("UPDATE dbo.vaults SET status='UNLOCKED' WHERE vault_id=?",f.vaultId());
        var recipient=UUID.fromString(jdbc.queryForObject("SELECT CONVERT(varchar(36),public_id) FROM dbo.beneficiaries WHERE vault_id=?",String.class,f.vaultId()));
        var asset=UUID.fromString(jdbc.queryForObject("SELECT CONVERT(varchar(36),a.public_id) FROM dbo.legal_basis_version_allocations l JOIN dbo.assets a ON a.asset_id=l.asset_id JOIN dbo.beneficiaries b ON b.beneficiary_id=l.beneficiary_id WHERE b.vault_id=?",String.class,f.vaultId()));
        var session=context.getBean(HandoverSessionService.class).open(f.publicCaseId(),f.legal()).sessionId();
        var result=new Ready(f,session,recipient,asset);
        if(deliver) deliver(result);
        return result;
    }
    /** BE-02: a new delivery needs the recipient's own linked account, so the fixture links one first (idempotent). */
    static void deliver(Ready r) {
        ensureLinkedAccount(r);
        deliverWithoutLinking(r);
    }
    static void deliverWithoutLinking(Ready r) {
        context.getBean(HandoverDeliveryService.class).deliver(r.f().publicCaseId(),r.session(),
            new HandoverDeliveryRequest(r.recipient(),List.of(r.asset())),r.f().legal());
    }
    static void ensureLinkedAccount(Ready r) {
        String recipient=r.recipient().toString();
        Long linked=jdbc.queryForObject("SELECT linked_user_id FROM dbo.beneficiaries WHERE public_id=?",Long.class,recipient);
        if(linked!=null) return;
        UUID account=UUID.randomUUID();
        long userId=jdbc.queryForObject("INSERT dbo.users (public_id, full_name, email, password_hash, status) OUTPUT inserted.user_id VALUES (?, 'Linked recipient', ?, 'unused', 'ACTIVE')",
            Long.class,account.toString(),account+"@example.test");
        jdbc.update("UPDATE dbo.beneficiaries SET linked_user_id=?, account_status='ACCOUNT_CREATED' WHERE public_id=?",userId,recipient);
    }
    record Ready(Fixture f,UUID session,UUID recipient,UUID asset) {}
}
