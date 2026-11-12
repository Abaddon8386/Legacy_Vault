package com.legacyvault.verification.service;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import com.legacyvault.verification.repository.HandoverItemRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.ReceiptAllocationRow;

/**
 * PS-64 (ST-25, LV-HANDOVER-001): xác định phạm vi bàn giao, tức tài sản nào được giao cho ai, chỉ dựa trên các dòng
 * phân bổ đã được Legal phê duyệt của phiên bản hồ sơ căn cứ hiện hành. Mọi thứ nằm ngoài phạm vi sẽ bị loại và nếu được
 * yêu cầu rõ ràng thì bị từ chối. Danh sách Beneficiary do Owner cấu hình KHÔNG bao giờ được dùng (LV-LEG-001).
 *
 * <p>Chạy trong transaction đã được {@link HandoverAuthorizationGuard} bảo vệ, nên việc đọc phê duyệt và phạm vi diễn ra
 * trong cùng một snapshot. Được các service bàn giao (giao tài sản, biên nhận, hoàn tất) gọi, thuộc nhóm API
 * {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/...}.
 * Đọc các bảng phân bổ phiên bản căn cứ ({@code LegalBasisVersionAllocation}) và các dòng bàn giao ({@code HandoverItem}).
 */
@Component
public class HandoverScopeResolver {

    private final LegalBasisVersionAllocationRepository allocations;
    private final HandoverItemRepository items;

    /**
     * Khởi tạo resolver với hai repository cần dùng.
     *
     * @param allocations repository các dòng phân bổ của phiên bản hồ sơ căn cứ (nguồn phạm vi đã duyệt)
     * @param items repository các mục bàn giao, dùng để biết dòng phân bổ nào đã được giao
     */
    public HandoverScopeResolver(LegalBasisVersionAllocationRepository allocations, HandoverItemRepository items) {
        this.allocations = allocations;
        this.items = items;
    }

    /**
     * Một dòng phân bổ đã được duyệt kèm trạng thái đã giao hay chưa.
     *
     * @param row dòng phân bổ đã duyệt (tài sản, người nhận, phiên bản, trạng thái định danh)
     * @param delivered {@code true} nếu dòng này đã có mục bàn giao được ghi nhận
     */
    public record ScopeLine(ReceiptAllocationRow row, boolean delivered) {}

    /**
     * Lấy các dòng đã duyệt của phiên bản hiện hành cho những người nhận đã qua bước xác minh trực tiếp tại quầy
     * ({@code Beneficiary.VERIFIED_AT_COUNTER}), có thể thu hẹp theo một người nhận.
     *
     * <p>Các bước: lọc dòng có {@code versionNo} khớp và trạng thái APPROVED; nếu có {@code recipientPublicId} thì chỉ giữ
     * dòng của người đó và yêu cầu tất cả dòng đều đã xác minh; nếu không thì giữ mọi dòng của người nhận đã xác minh. Cuối
     * cùng đánh dấu dòng nào đã được giao qua {@code HandoverItemRepository.findDeliveredAllocationIds}.
     * Yêu cầu transaction đã tồn tại ({@code Propagation.MANDATORY}).
     *
     * @param dossierId id nội bộ của hồ sơ căn cứ pháp lý
     * @param versionNo số phiên bản hồ sơ hiện hành
     * @param recipientPublicId public id người nhận cần lọc, hoặc {@code null} để lấy tất cả người nhận đủ điều kiện
     * @return danh sách {@link ScopeLine} thuộc phạm vi bàn giao
     * @throws BusinessException với {@code HANDOVER_RECIPIENT_NOT_ELIGIBLE} khi người nhận được yêu cầu nằm ngoài phạm vi
     *         hoặc chưa được xác minh tại quầy
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<ScopeLine> resolve(Long dossierId, int versionNo, UUID recipientPublicId) {
        List<ReceiptAllocationRow> approved = allocations.findReceiptRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo
                        && LegalBasisVersionAllocation.STATUS_APPROVED.equals(row.status()))
                .toList();
        if (recipientPublicId != null) {
            List<ReceiptAllocationRow> forRecipient = approved.stream()
                    .filter(row -> row.beneficiaryPublicId().equals(recipientPublicId)).toList();
            boolean verified = !forRecipient.isEmpty() && forRecipient.stream().allMatch(
                    row -> Beneficiary.VERIFIED_AT_COUNTER.equals(row.beneficiaryIdentityVerificationStatus()));
            if (!verified) {
                throw new BusinessException(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE);
            }
            approved = forRecipient;
        } else {
            approved = approved.stream().filter(row -> Beneficiary.VERIFIED_AT_COUNTER
                    .equals(row.beneficiaryIdentityVerificationStatus())).toList();
        }
        Set<Long> delivered = deliveredIds(approved.stream().map(ReceiptAllocationRow::allocationId).toList());
        return approved.stream().map(row -> new ScopeLine(row, delivered.contains(row.allocationId()))).toList();
    }

    /**
     * Trả về tập id dòng phân bổ đã có mục bàn giao hợp lệ.
     *
     * @param allocationIds các id dòng phân bổ cần kiểm tra
     * @return tập id đã giao; rỗng nếu đầu vào rỗng (tránh truy vấn thừa)
     */
    private Set<Long> deliveredIds(Collection<Long> allocationIds) {
        if (allocationIds.isEmpty()) {
            return Set.of();
        }
        return items.findDeliveredAllocationIds(allocationIds).stream().collect(Collectors.toSet());
    }
}
