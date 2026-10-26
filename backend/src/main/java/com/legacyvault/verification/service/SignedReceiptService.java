package com.legacyvault.verification.service;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.*;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.will.service.WillFile;
import com.legacyvault.audit.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;
import java.nio.charset.StandardCharsets;
@Service
public class SignedReceiptService {
 private final BeneficiaryReconciliationService confirmations;
 private final BeneficiaryConfirmationRepository records;
 private final VerificationCaseRepository cases;
 private final HandoverSessionRepository sessions;
 private final EncryptionService encryption;
 private final AuditService audit;
 public SignedReceiptService(BeneficiaryReconciliationService confirmations, BeneficiaryConfirmationRepository records,
  VerificationCaseRepository cases,HandoverSessionRepository sessions,EncryptionService encryption,AuditService audit){
  this.confirmations=confirmations;this.records=records;this.cases=cases;this.sessions=sessions;this.encryption=encryption;this.audit=audit;
 }
 @Transactional
 public BeneficiaryConfirmationResponse confirm(UUID caseId,UUID sessionId,UUID recipientId,MultipartFile file,
   boolean attested,String paperReference,CustomUserPrincipal actor){
  if(!attested || paperReference!=null && paperReference.length()>200)throw new BusinessException(ErrorCode.VALIDATION_FAILED);
  var inspected=WillFile.inspect(file,10L*1024*1024);
  String reference="BN-"+UUID.nameUUIDFromBytes((sessionId+":"+recipientId).getBytes(StandardCharsets.UTF_8));
  return confirmations.confirmSigned(caseId,sessionId,recipientId,new ConfirmBeneficiaryRequest(reference),actor,inspected,paperReference==null?null:paperReference.trim());
 }
 @Transactional
 public IntakeAttachmentService.IntakeFile read(UUID caseId,UUID sessionId,UUID confirmationId,CustomUserPrincipal actor){
  Long staff=CustomUserPrincipal.requireUserId(actor);
  var verificationCase=cases.findByPublicIdAndAssignedStaffUserId(caseId,staff).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
  var session=sessions.findByPublicIdAndCaseAndStaffForUpdate(sessionId,verificationCase.getVerificationCaseId(),staff).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
  var record=records.findByPublicId(confirmationId).filter(r->r.getSessionId().equals(session.getId())&&r.hasSignedFile()).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
  byte[] content=encryption.decryptBytes(record.signedData(),record.getPublicId().toString().getBytes(StandardCharsets.UTF_8));
  audit.record(new AuditEvent(AuditAction.EVIDENCE_FILE_READ,AuditActorType.USER,staff,verificationCase.getVaultId(),"BENEFICIARY_CONFIRMATION",record.getId(),null,null,null,Map.of("confirmationId",confirmationId.toString()),"ST-26","LV-CLOSE-001"));
  return new IntakeAttachmentService.IntakeFile(content,record.getSignedFileType(),record.getSignedFileName());
 }
}
