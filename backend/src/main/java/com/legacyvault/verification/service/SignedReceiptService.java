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
/**
 * Nhận và đọc lại phiếu xác nhận có chữ ký của người thụ hưởng trong phiên bàn giao (ST-26, LV-CLOSE-001).
 *
 * <p>Được {@code BeneficiaryReconciliationController} gọi, base path
 * {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}} (vai trò STAFF_EXECUTOR):
 * {@code POST /beneficiaries/{beneficiaryId}/confirmation} (multipart: {@code file}, {@code attested},
 * {@code paperReference}) gọi {@link #confirm}; {@code GET /beneficiary-confirmations/{confirmationId}/file} gọi
 * {@link #read}. Việc ghi xác nhận được ủy quyền cho {@link BeneficiaryReconciliationService}; nội dung tệp được lưu mã
 * hóa.
 */
@Service
public class SignedReceiptService {
 private final BeneficiaryReconciliationService confirmations;
 private final BeneficiaryConfirmationRepository records;
 private final VerificationCaseRepository cases;
 private final HandoverSessionRepository sessions;
 private final EncryptionService encryption;
 private final AuditService audit;
 /**
  * @param confirmations dịch vụ đối soát người thụ hưởng, nơi thực sự ghi xác nhận
  * @param records repository các bản xác nhận người thụ hưởng
  * @param cases repository hồ sơ xác minh
  * @param sessions repository phiên bàn giao
  * @param encryption dịch vụ mã hóa/giải mã
  * @param audit dịch vụ ghi nhật ký kiểm toán
  */
 public SignedReceiptService(BeneficiaryReconciliationService confirmations, BeneficiaryConfirmationRepository records,
  VerificationCaseRepository cases,HandoverSessionRepository sessions,EncryptionService encryption,AuditService audit){
  this.confirmations=confirmations;this.records=records;this.cases=cases;this.sessions=sessions;this.encryption=encryption;this.audit=audit;
 }
 /**
  * Ghi nhận xác nhận có chữ ký của người thụ hưởng.
  * API: {@code POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/beneficiaries/{recipientId}/confirmation}.
  *
  * <p>Yêu cầu Staff đã tích attested và số tham chiếu giấy (nếu có) tối đa 200 ký tự; kiểm tra tệp theo nội dung với giới
  * hạn 10 MB; tạo mã tham chiếu xác định {@code BN-<uuid>} từ session và người nhận; ủy quyền cho
  * {@code BeneficiaryReconciliationService.confirmSigned}.
  *
  * @param caseId public id hồ sơ xác minh
  * @param sessionId public id phiên bàn giao
  * @param recipientId public id người thụ hưởng
  * @param file bản scan phiếu có chữ ký
  * @param attested Staff xác nhận đã chứng kiến
  * @param paperReference số tham chiếu giấy, tùy chọn
  * @param actor Staff đang đăng nhập
  * @return xác nhận vừa ghi
  * @throws BusinessException {@code VALIDATION_FAILED} khi chưa attested hoặc tham chiếu quá dài, cùng lỗi từ kiểm tra
  *         tệp và từ dịch vụ đối soát
  */
 @Transactional
 public BeneficiaryConfirmationResponse confirm(UUID caseId,UUID sessionId,UUID recipientId,MultipartFile file,
   boolean attested,String paperReference,CustomUserPrincipal actor){
  if(!attested || paperReference!=null && paperReference.length()>200)throw new BusinessException(ErrorCode.VALIDATION_FAILED);
  var inspected=WillFile.inspect(file,10L*1024*1024);
  String reference="BN-"+UUID.nameUUIDFromBytes((sessionId+":"+recipientId).getBytes(StandardCharsets.UTF_8));
  return confirmations.confirmSigned(caseId,sessionId,recipientId,new ConfirmBeneficiaryRequest(reference),actor,inspected,paperReference==null?null:paperReference.trim());
 }
 /**
  * Tải lại tệp phiếu xác nhận đã nộp (giải mã) và ghi audit đọc.
  * API: {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/beneficiary-confirmations/{confirmationId}/file}.
  *
  * <p>Kiểm tra Staff là người được giao case, khóa phiên, tìm xác nhận thuộc phiên và có tệp ký, giải mã nội dung (dữ
  * liệu đi kèm là public id xác nhận), ghi audit {@code EVIDENCE_FILE_READ} (không chứa tên hay nội dung tệp).
  *
  * @param caseId public id hồ sơ xác minh
  * @param sessionId public id phiên bàn giao
  * @param confirmationId public id của bản xác nhận
  * @param actor Staff đang đăng nhập
  * @return tệp đã giải mã
  * @throws BusinessException {@code RESOURCE_NOT_FOUND}
  */
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
