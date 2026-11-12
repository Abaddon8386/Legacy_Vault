package com.legacyvault.handover.policy;

/**
 * PS-70 AND rule only. Counts must be derived by the server from the same locked
 * session/approval snapshot. READY is a completion result, not authorization to
 * close, proof of approval validity, or a substitute for a database transaction.
 * <p>
 * Cổng hoàn tất kép: chỉ coi là sẵn sàng khi VỪA giao đủ tài sản VÀ đối soát đủ người nhận. Lớp tiện ích tĩnh, thuần tính toán
 * (không DB). {@code HandoverCompletionService} dùng kết quả từ {@link AssetCompletionProgress} và {@link BeneficiaryCompletionProgress};
 * việc đóng phiên thật (tạo {@code HandoverCompletionEvidence}) do {@code HandoverCloseService} thực hiện sau khi kiểm tra lại dưới khóa phiên.
 */
public final class DualCompletionGate {
    /**
     * Không cho khởi tạo (lớp tiện ích).
     */
    private DualCompletionGate() { }

    /**
     * Kết quả đánh giá: {@code READY} (đủ cả hai), {@code ASSETS_PENDING} (còn tài sản chưa giao), {@code BENEFICIARIES_PENDING}
     * (còn người nhận chưa xác nhận), {@code BOTH_PENDING} (còn cả hai), {@code EMPTY_SCOPE} (phạm vi tài sản hoặc người nhận rỗng).
     */
    public enum Result { READY, ASSETS_PENDING, BENEFICIARIES_PENDING, BOTH_PENDING, EMPTY_SCOPE }

    /**
     * Đánh giá cổng AND. Phạm vi rỗng (tổng tài sản hoặc tổng người nhận bằng 0) luôn cho {@code EMPTY_SCOPE}, không bao giờ READY.
     * @param deliveredAssets        số tài sản đã giao đủ
     * @param totalAssets            tổng tài sản trong phạm vi
     * @param confirmedBeneficiaries số người nhận đã xác nhận
     * @param totalBeneficiaries     tổng người nhận trong phạm vi
     * @return {@link Result} tương ứng
     * @throws IllegalArgumentException khi số liệu âm hoặc đã hoàn tất lớn hơn tổng
     */
    public static Result evaluate(long deliveredAssets, long totalAssets,
                                  long confirmedBeneficiaries, long totalBeneficiaries) {
        validate(deliveredAssets, totalAssets);
        validate(confirmedBeneficiaries, totalBeneficiaries);
        if (totalAssets == 0 || totalBeneficiaries == 0) return Result.EMPTY_SCOPE;
        boolean assetsComplete = deliveredAssets == totalAssets;
        boolean beneficiariesComplete = confirmedBeneficiaries == totalBeneficiaries;
        if (assetsComplete && beneficiariesComplete) return Result.READY;
        if (!assetsComplete && !beneficiariesComplete) return Result.BOTH_PENDING;
        return assetsComplete ? Result.BENEFICIARIES_PENDING : Result.ASSETS_PENDING;
    }

    /**
     * Kiểm tra {@code 0 <= completed <= total}.
     * @param completed số đã hoàn tất
     * @param total     tổng số
     * @throws IllegalArgumentException khi số liệu không hợp lệ
     */
    private static void validate(long completed, long total) {
        if (completed < 0 || total < 0 || completed > total) {
            throw new IllegalArgumentException("Invalid completion counts");
        }
    }
}
