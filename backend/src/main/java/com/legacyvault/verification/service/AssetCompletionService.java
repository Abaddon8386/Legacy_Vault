package com.legacyvault.verification.service;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.handover.policy.AssetCompletionProgress;
import com.legacyvault.verification.dto.CompletionProgressResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;
/**
 * Tính tiến độ hoàn tất theo TÀI SẢN của một phiên bàn giao (handover session).
 *
 * Một tài sản chia cho nhiều người nhận chỉ được tính là đã giao khi TẤT CẢ dòng phân bổ đã duyệt của nó đã giao.
 * Được gọi bởi {@code AssetCompletionController} qua
 * {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/asset-completion}
 * (vai trò {@code STAFF_EXECUTOR}) và bởi {@link HandoverCompletionService} khi đánh giá cổng hoàn tất kép.
 */
@Service
public class AssetCompletionService {
 /**
  * Bộ truy cập khóa ca/phiên và dựng ảnh chụp (snapshot) dữ liệu bàn giao.
  */
 private final HandoverCompletionAccess access;
 /**
  * Khởi tạo service với bộ truy cập snapshot bàn giao.
  *
  * @param access bộ truy cập khóa Vault → ca → hồ sơ → phiên và dựng snapshot
  */
 public AssetCompletionService(HandoverCompletionAccess access){this.access=access;}
 /**
  * Trả tiến độ tài sản của phiên bàn giao cho Staff đang phụ trách ca (endpoint {@code asset-completion}).
  * Đọc snapshot bằng {@link HandoverCompletionAccess#read} (kiểm tra quyền sở hữu ca/phiên) rồi tính bằng {@link #calculate}.
  * Chạy trong một transaction (đọc có khóa nên không dùng readOnly).
  *
  * @param caseId UUID công khai của ca xác minh
  * @param sessionId UUID công khai của phiên bàn giao
  * @param actor Staff đang đăng nhập
  * @return số tài sản đã giao, tổng, danh sách còn chờ và cờ đã giao hết
  * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND hoặc HANDOVER_SESSION_INVALID_STATE từ lớp truy cập
  */
 @Transactional
 public CompletionProgressResponse get(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  return calculate(access.read(caseId,sessionId,actor));
 }
 /**
  * An asset shared by multiple recipients is delivered only when ALL approved allocation lines are delivered.
  *
  * <p>Tính tiến độ từ snapshot: nhóm các dòng phân bổ đã duyệt theo tài sản, một tài sản được coi là đã giao
  * khi mọi dòng của nó nằm trong tập {@code snapshot.delivered()}; kết quả được tổng hợp bởi {@link AssetCompletionProgress}.
  * Không truy cập DB trực tiếp (dữ liệu đã nằm trong snapshot).
  *
  * @param snapshot ảnh chụp bàn giao đã khóa
  * @return tiến độ theo tài sản (đã giao, tổng, còn chờ, đã giao hết)
  */
 public CompletionProgressResponse calculate(HandoverCompletionAccess.Snapshot snapshot){
  var byAsset=snapshot.rows().stream().collect(java.util.stream.Collectors.groupingBy(
   com.legacyvault.verification.repository.ReceiptAllocationRow::assetPublicId));
  var delivered=byAsset.entrySet().stream().filter(e->e.getValue().stream()
   .allMatch(row->snapshot.delivered().contains(row.allocationId()))).map(Map.Entry::getKey).toList();
  var p=AssetCompletionProgress.from(byAsset.keySet(),delivered);
  return new CompletionProgressResponse(p.delivered(),p.total(),p.pending(),p.allDelivered());
 }
}
