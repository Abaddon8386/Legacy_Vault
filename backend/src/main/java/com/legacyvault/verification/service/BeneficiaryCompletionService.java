package com.legacyvault.verification.service;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.handover.policy.BeneficiaryCompletionProgress;
import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.verification.dto.CompletionProgressResponse;
import com.legacyvault.verification.repository.BeneficiaryConfirmationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;
/**
 * Tính tiến độ hoàn tất theo NGƯỜI NHẬN của một phiên bàn giao: một người nhận được tính là đã xác nhận khi có bản ghi xác nhận
 * khớp phiên bản/hash phạm vi hiện hành VÀ danh tính đã xác minh tại quầy.
 *
 * Được gọi bởi {@code BeneficiaryCompletionController} qua
 * {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/beneficiary-completion}
 * (vai trò {@code STAFF_EXECUTOR}) và bởi {@link HandoverCompletionService}. Đọc bảng xác nhận người nhận qua
 * {@link BeneficiaryConfirmationRepository}.
 */
@Service
public class BeneficiaryCompletionService {
 private final HandoverCompletionAccess access;
 private final BeneficiaryConfirmationRepository confirmations;
 /**
  * @param access bộ truy cập snapshot bàn giao
  * @param confirmations repository các bản ghi xác nhận của người nhận
  */
 public BeneficiaryCompletionService(HandoverCompletionAccess access,BeneficiaryConfirmationRepository confirmations){
  this.access=access;this.confirmations=confirmations;
 }
 /**
  * Trả tiến độ người nhận cho endpoint {@code beneficiary-completion}; đọc snapshot bằng {@link HandoverCompletionAccess#read}.
  *
  * @param caseId UUID công khai của ca
  * @param sessionId UUID công khai của phiên bàn giao
  * @param actor Staff đang đăng nhập
  * @return số người nhận đã xác nhận, tổng, còn chờ và cờ đã đủ
  */
 @Transactional
 public CompletionProgressResponse get(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  return calculate(access.read(caseId,sessionId,actor));
 }
 /**
  * Tính tiến độ từ snapshot (yêu cầu đã có transaction, {@code Propagation.MANDATORY}). Tập người nhận liên quan lấy từ các dòng phân bổ
  * đã duyệt; người nhận được tính là đã xác nhận khi có bản ghi xác nhận của đúng phiên/phiên bản/hash phạm vi và trạng thái danh tính là
  * {@code VERIFIED_AT_COUNTER}. Nhờ đó một danh tính bị thu hồi không thể bị che bằng cách loại người đó khỏi phạm vi.
  *
  * @param s snapshot bàn giao đã khóa
  * @return tiến độ theo người nhận
  */
 @Transactional(propagation=Propagation.MANDATORY)
 public CompletionProgressResponse calculate(HandoverCompletionAccess.Snapshot s){
  var rows=s.rows();
  var recorded=confirmations.findBySessionIdAndVersionIdAndScopeHash(s.session().getId(),
   s.version().id(),s.scopeHash()).stream().map(c->c.getBeneficiaryId()).collect(java.util.stream.Collectors.toSet());
  var relevant=rows.stream().map(r->r.beneficiaryPublicId()).distinct().toList();
  // A revoked identity check cannot be hidden from the gate by dropping its recipient from scope.
  var confirmed=rows.stream().filter(r->recorded.contains(r.beneficiaryId())
   && Beneficiary.VERIFIED_AT_COUNTER.equals(r.beneficiaryIdentityVerificationStatus()))
   .map(r->r.beneficiaryPublicId()).distinct().toList();
  var p=BeneficiaryCompletionProgress.from(relevant,confirmed);
  return new CompletionProgressResponse(p.confirmed(),p.total(),p.pending(),p.allConfirmed());
 }
}
