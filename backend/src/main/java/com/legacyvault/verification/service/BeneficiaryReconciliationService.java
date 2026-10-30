package com.legacyvault.verification.service;
import com.legacyvault.audit.*;
import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.entity.BeneficiaryConfirmationRecord;
import com.legacyvault.verification.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
@Service
public class BeneficiaryReconciliationService {
private final com.legacyvault.verification.group.GroupHandoverService group;
    private final HandoverCompletionAccess access;
    private final BeneficiaryConfirmationRepository confirmations;
    private final UserRepository users;
    private final AuditService audit;
    private final com.legacyvault.common.crypto.EncryptionService encryption;
    public BeneficiaryReconciliationService(HandoverCompletionAccess access,BeneficiaryConfirmationRepository confirmations,
            UserRepository users,AuditService audit,com.legacyvault.common.crypto.EncryptionService encryption, com.legacyvault.verification.group.GroupHandoverService group){this.group=group;this.access=access;this.confirmations=confirmations;this.users=users;this.audit=audit;this.encryption=encryption;}
    @Transactional
    public List<BeneficiaryConfirmationResponse> list(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
        var snapshot=access.read(caseId,sessionId,actor);
        var saved=confirmations.findBySessionIdAndVersionIdAndScopeHash(snapshot.session().getId(),
                snapshot.version().id(),snapshot.scopeHash());
        return snapshot.rows().stream().map(ReceiptAllocationRow::beneficiaryPublicId).distinct()
                .map(id->{
                    var recipient=snapshot.rows().stream().filter(r->r.beneficiaryPublicId().equals(id)).findFirst().orElseThrow();
                    var record=saved.stream().filter(c->c.getBeneficiaryId().equals(recipient.beneficiaryId())).findFirst();
                    return record.map(c->response(c,sessionId,id)).orElseGet(()->
                        new BeneficiaryConfirmationResponse(null,sessionId,id,"PENDING",null,null,null));
                }).toList();
    }
    @Transactional
    public BeneficiaryConfirmationResponse confirm(UUID caseId,UUID sessionId,UUID recipientId,
            ConfirmBeneficiaryRequest request,CustomUserPrincipal actor){
        return confirmInternal(caseId,sessionId,recipientId,request,actor,null,null);
    }
    @Transactional
    public BeneficiaryConfirmationResponse confirmSigned(UUID caseId,UUID sessionId,UUID recipientId,ConfirmBeneficiaryRequest request,CustomUserPrincipal actor,com.legacyvault.will.service.WillFile file,String paperReference){
        return confirmInternal(caseId,sessionId,recipientId,request,actor,file,paperReference);
    }
    private BeneficiaryConfirmationResponse confirmInternal(UUID caseId,UUID sessionId,UUID recipientId,ConfirmBeneficiaryRequest request,CustomUserPrincipal actor,com.legacyvault.will.service.WillFile file,String paperReference){
        if(request==null||request.receiptReference()==null||request.receiptReference().isBlank()
                ||request.receiptReference().length()>200)throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var snapshot=access.lock(caseId,sessionId,actor,false);
        group.requireReady(caseId,sessionId,actor);
        var rows=snapshot.rows().stream().filter(r->r.beneficiaryPublicId().equals(recipientId)).toList();
        if(rows.isEmpty()||rows.stream().anyMatch(r->!Beneficiary.VERIFIED_AT_COUNTER.equals(r.beneficiaryIdentityVerificationStatus())))
            throw new BusinessException(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE);
        if(rows.stream().anyMatch(r->!snapshot.delivered().contains(r.allocationId())))
            throw new BusinessException(ErrorCode.HANDOVER_CONFIRMATION_PENDING_DELIVERY);
        Long recipient=rows.getFirst().beneficiaryId();
        var prior=confirmations.findBySessionIdAndVersionIdAndScopeHash(snapshot.session().getId(),
                snapshot.version().id(),snapshot.scopeHash()).stream().filter(c->c.getBeneficiaryId().equals(recipient)).findFirst();
        if(prior.isPresent()){
            if(!prior.get().getReference().equals(request.receiptReference()))
                throw new BusinessException(ErrorCode.HANDOVER_CONFIRMATION_CONFLICT);
            if(file!=null && (!prior.get().hasSignedFile() || !file.sha256().equals(prior.get().getSignedSha256()))) throw new BusinessException(ErrorCode.HANDOVER_CONFIRMATION_CONFLICT);
            return response(prior.get(),sessionId,recipientId);
        }
        var record=new BeneficiaryConfirmationRecord(snapshot.session().getId(),
                snapshot.version().id(),snapshot.scopeHash(),recipient,actor.userId(),
                LocalDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS),request.receiptReference());
        if(file!=null){
            record.setPaperReference(paperReference);
            record.attachSignedFile(encryption.encrypt(file.content(),record.getPublicId().toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)),file.fileName(),file.contentType(),file.sha256());
        }
        confirmations.saveAndFlush(record);
        audit.record(new AuditEvent(AuditAction.BENEFICIARY_HANDOVER_CONFIRMED,AuditActorType.USER,actor.userId(),
                snapshot.locked().vault().getVaultId(),"BENEFICIARY_CONFIRMATION",record.getId(),"PENDING","CONFIRMED",null,
                Map.of("sessionId",sessionId.toString(),"beneficiaryId",recipientId.toString(),
                    "confirmationId",record.getPublicId().toString()),"ST-26","LV-CLOSE-001"));
        return response(record,sessionId,recipientId);
    }
    private BeneficiaryConfirmationResponse response(BeneficiaryConfirmationRecord c,UUID session,UUID recipient){
        var actor=users.findById(c.getActorId()).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        return new BeneficiaryConfirmationResponse(c.getPublicId(),session,recipient,"CONFIRMED",
                actor.getPublicId(),c.getConfirmedAt().toInstant(ZoneOffset.UTC),c.getReference(),c.hasSignedFile());
    }
}
