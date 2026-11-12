package com.legacyvault.verification.service;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.handover.policy.DualCompletionGate;
import com.legacyvault.verification.dto.HandoverCompletionResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.UUID;
/**
 * Đánh giá cổng hoàn tất kép của phiên bàn giao: tài sản và người nhận đều phải xong (xem {@code DualCompletionGate}).
 *
 * Được gọi bởi {@code HandoverCompletionController} qua
 * {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/completion-progress} (GET, vai trò {@code STAFF_EXECUTOR}), trả {@link HandoverCompletionResponse}.
 * Còn được {@link HandoverCloseService} và {@link HandoverArchiveService} dùng để chặn đóng/lưu trữ khi chưa hoàn tất.
 */
@Service
public class HandoverCompletionService {
 private final HandoverCompletionAccess access;
 private final AssetCompletionService assets;
 private final BeneficiaryCompletionService beneficiaries;
 /**
  * @param access bộ truy cập snapshot
  * @param assets service tiến độ tài sản
  * @param beneficiaries service tiến độ người nhận
  */
 public HandoverCompletionService(HandoverCompletionAccess access,AssetCompletionService assets,
  BeneficiaryCompletionService beneficiaries){this.access=access;this.assets=assets;this.beneficiaries=beneficiaries;}
 /**
  * Endpoint {@code completion-progress}: đọc snapshot bằng {@link HandoverCompletionAccess#read} rồi đánh giá.
  *
  * @param caseId UUID công khai của ca
  * @param sessionId UUID công khai của phiên
  * @param actor Staff đang đăng nhập
  * @return tiến độ tài sản, người nhận, cờ sẵn sàng và kết quả cổng
  */
 @Transactional
 public HandoverCompletionResponse get(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  return evaluate(access.read(caseId,sessionId,actor));
 }
 /**
  * Tính tiến độ tài sản và người nhận từ snapshot rồi áp {@code DualCompletionGate.evaluate}. Cần transaction sẵn có.
  *
  * @param snapshot snapshot bàn giao đã khóa
  * @return kết quả đánh giá (sẵn sàng khi cổng trả READY)
  */
 @Transactional(propagation=Propagation.MANDATORY)
 public HandoverCompletionResponse evaluate(HandoverCompletionAccess.Snapshot snapshot){
  var a=assets.calculate(snapshot);var b=beneficiaries.calculate(snapshot);
  var result=DualCompletionGate.evaluate(a.completed(),a.total(),b.completed(),b.total());
  return new HandoverCompletionResponse(a,b,result==DualCompletionGate.Result.READY,result.name());
 }
 /**
  * Như {@link #evaluate} nhưng ném lỗi nếu chưa sẵn sàng.
  *
  * @throws com.legacyvault.common.error.BusinessException HANDOVER_COMPLETION_PENDING
  */
 @Transactional(propagation=Propagation.MANDATORY)
 public HandoverCompletionResponse requireReady(HandoverCompletionAccess.Snapshot snapshot){
  var result=evaluate(snapshot);
  if(!result.ready())throw new BusinessException(ErrorCode.HANDOVER_COMPLETION_PENDING);
  return result;
 }
}
