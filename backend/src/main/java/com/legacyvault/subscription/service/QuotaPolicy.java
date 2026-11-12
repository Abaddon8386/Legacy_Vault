package com.legacyvault.subscription.service;

import java.util.Objects;

/**
 * PS-77: tính toán mức tăng quota thuần (không DB). {@link OwnerQuotaService} cung cấp mức dùng và giới hạn thật trong giao dịch.
 */
public final class QuotaPolicy {
    /**
     * Mức sử dụng: số Asset và byte; không được âm.
     *
     * @throws IllegalArgumentException nếu có giá trị âm
     */
    public record Usage(long assets, long bytes) {
        public Usage {
            if (assets < 0 || bytes < 0) throw new IllegalArgumentException("Usage must be nonnegative");
        }
    }

    /**
     * Giới hạn: số Asset và byte; phải dương.
     *
     * @throws IllegalArgumentException nếu không dương
     */
    public record Limits(long assets, long bytes) {
        public Limits {
            if (assets <= 0 || bytes <= 0) throw new IllegalArgumentException("Limits must be positive");
        }
    }

    /**
     * Mức thay đổi do thao tác ghi: caller quyết định nội dung nào được tính; byte được ghi rõ, không quy đổi MB/GB.
     */
    public record Delta(long assets, long bytes) {}

    /**
     * Kết quả đánh giá: mức dùng dự kiến, có vượt giới hạn Asset không, có vượt dung lượng không.
     */
    public record Decision(Usage projectedUsage, boolean assetLimitExceeded, boolean storageLimitExceeded) {
        /**
         * @return true nếu không vượt giới hạn nào
         */
        public boolean allowed() {
            return !assetLimitExceeded && !storageLimitExceeded;
        }
    }

    /**
     * Đánh giá từng chiều độc lập. Mức dùng không tăng vẫn được phép dù đang vượt quota. Tổng âm không hợp lệ và tràn long bị từ chối ({@link Math#addExact}), không bao giờ cuộn vòng hay cắt.
     *
     * @param usage mức dùng hiện tại
     * @param limits giới hạn của gói
     * @param delta mức tăng dự kiến
     * @return {@link Decision}
     */
    public Decision evaluate(Usage usage, Limits limits, Delta delta) {
        Objects.requireNonNull(usage, "usage");
        Objects.requireNonNull(limits, "limits");
        Objects.requireNonNull(delta, "delta");
        Usage projected = new Usage(Math.addExact(usage.assets(), delta.assets()),
                Math.addExact(usage.bytes(), delta.bytes()));
        return new Decision(projected,
                delta.assets() > 0 && projected.assets() > limits.assets(),
                delta.bytes() > 0 && projected.bytes() > limits.bytes());
    }
}
