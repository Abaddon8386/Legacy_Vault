package com.legacyvault.handover.policy;

import java.util.Collection;
import java.util.Set;

/**
 * Pure PS-68 calculation, never an authorization or close operation.
 * The caller must load both sets for the same valid approval/session snapshot.
 * An asset with multiple recipients belongs in fullyDeliveredAssetIds only after
 * every required delivery for that asset is complete (PS-64/65 responsibility).
 * <p>
 * Tiến độ bàn giao tài sản của một phiên bàn giao: {@code delivered} / {@code total}. Đây là phép tính thuần (không truy cập DB,
 * không phải kiểm tra quyền); {@code AssetCompletionService} nạp dữ liệu rồi dùng record này, kết quả đi vào {@link DualCompletionGate}.
 * @param delivered số tài sản đã giao đủ cho mọi người nhận
 * @param total     số tài sản thuộc phạm vi đã được duyệt
 */
public record AssetCompletionProgress(int delivered, int total) {
    /**
     * Constructor gọn: kiểm tra {@code 0 <= delivered <= total}.
     * @throws IllegalArgumentException khi số liệu không hợp lệ
     */
    public AssetCompletionProgress {
        if (delivered < 0 || total < 0 || delivered > total) {
            throw new IllegalArgumentException("Invalid asset completion counts");
        }
    }

    /**
     * Tính tiến độ từ hai tập id: tài sản trong phạm vi đã duyệt và tài sản đã giao đủ. Chỉ đếm id nằm trong phạm vi đã duyệt (id thừa bị bỏ qua).
     * @param approvedAssetIds       các tài sản thuộc phạm vi được duyệt
     * @param fullyDeliveredAssetIds các tài sản đã giao đủ
     * @return tiến độ tương ứng
     */
    public static AssetCompletionProgress from(Collection<java.util.UUID> approvedAssetIds,
                                                Collection<java.util.UUID> fullyDeliveredAssetIds) {
        var approved = Set.copyOf(approvedAssetIds);
        var delivered = Set.copyOf(fullyDeliveredAssetIds);
        int count = 0;
        for (var id : approved) {
            if (delivered.contains(id)) count++;
        }
        return new AssetCompletionProgress(count, approved.size());
    }

    /**
     * @return số tài sản còn chờ giao ({@code total - delivered})
     */
    public int pending() {
        return total - delivered;
    }

    /**
     * Cho biết đã giao đủ tài sản hay chưa. Phạm vi rỗng không chứng minh hoàn tất nên trả false (integration phải kiểm tra phạm vi).
     * @return true khi {@code total > 0} và {@code delivered == total}
     */
    public boolean allDelivered() {
        return total > 0 && delivered == total;
    }
}
