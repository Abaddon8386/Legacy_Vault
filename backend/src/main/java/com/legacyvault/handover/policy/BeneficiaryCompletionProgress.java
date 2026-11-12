package com.legacyvault.handover.policy;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * Pure PS-69 calculation over a single session/approval snapshot.
 * Relevant recipients come from approved scope, not all designated beneficiaries.
 * Confirmed IDs must come from explicit reconciliation records, never delivery.
 * The caller is responsible for authorization, valid approval and consistent reads.
 * <p>
 * Tiến độ đối soát người nhận: {@code confirmed} / {@code total}. Phép tính thuần, không truy cập DB;
 * {@code BeneficiaryCompletionService} nạp dữ liệu (xác nhận lấy từ bản ghi đối soát {@code beneficiary_confirmations}) rồi dùng record này,
 * kết quả đi vào {@link DualCompletionGate}.
 * @param confirmed số người nhận đã được xác nhận đối soát
 * @param total     số người nhận liên quan trong phạm vi đã duyệt
 */
public record BeneficiaryCompletionProgress(int confirmed, int total) {
    /**
     * Constructor gọn: kiểm tra {@code 0 <= confirmed <= total}.
     * @throws IllegalArgumentException khi số liệu không hợp lệ
     */
    public BeneficiaryCompletionProgress {
        if (confirmed < 0 || total < 0 || confirmed > total) {
            throw new IllegalArgumentException("Invalid beneficiary completion counts");
        }
    }

    /**
     * Tính tiến độ từ hai tập id: người nhận liên quan và người nhận đã xác nhận. Chỉ đếm id nằm trong tập liên quan.
     * @param relevantBeneficiaryIds người nhận thuộc phạm vi đã duyệt
     * @param confirmedBeneficiaryIds người nhận đã có xác nhận đối soát
     * @return tiến độ tương ứng
     */
    public static BeneficiaryCompletionProgress from(Collection<UUID> relevantBeneficiaryIds,
                                                       Collection<UUID> confirmedBeneficiaryIds) {
        var relevant = Set.copyOf(relevantBeneficiaryIds);
        var confirmed = Set.copyOf(confirmedBeneficiaryIds);
        int count = 0;
        for (var id : relevant) {
            if (confirmed.contains(id)) count++;
        }
        return new BeneficiaryCompletionProgress(count, relevant.size());
    }

    /**
     * @return số người nhận chưa xác nhận ({@code total - confirmed})
     */
    public int pending() {
        return total - confirmed;
    }

    /**
     * Cho biết mọi người nhận đã xác nhận chưa. Phạm vi rỗng không phải bằng chứng hoàn tất nên trả false.
     * @return true khi {@code total > 0} và {@code confirmed == total}
     */
    public boolean allConfirmed() {
        return total > 0 && confirmed == total;
    }
}
