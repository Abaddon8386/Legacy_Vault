package com.legacyvault.handover.policy;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * PS-67 value model only; not a persisted confirmation or authorization decision.
 * Delivery cannot create a confirmation. The eventual use case must obtain actor
 * and time from trusted server context and validate the session's approved scope.
 * <p>
 * Mô hình giá trị (không phải entity) cho xác nhận của một người nhận trong một phiên bàn giao. Bản xác nhận được lưu thật nằm ở
 * {@code BeneficiaryConfirmationRecord}.
 * @param sessionId     id phiên bàn giao
 * @param beneficiaryId id người nhận
 * @param status        {@link Status#PENDING} hoặc {@link Status#CONFIRMED}
 * @param confirmedBy   người xác nhận (chỉ có khi CONFIRMED)
 * @param confirmedAt   thời điểm xác nhận (chỉ có khi CONFIRMED)
 * @param reference     mã tham chiếu biên nhận (bắt buộc khi CONFIRMED; nhạy cảm nên không in ra {@code toString})
 */
public record BeneficiaryConfirmation(UUID sessionId, UUID beneficiaryId, Status status,
                                      UUID confirmedBy, Instant confirmedAt, String reference) {
    /**
     * Trạng thái xác nhận: {@code PENDING} (chưa xác nhận, không được mang bằng chứng) hoặc {@code CONFIRMED} (đã xác nhận, bắt buộc có người, thời điểm, tham chiếu).
     */
    public enum Status { PENDING, CONFIRMED }

    /**
     * Constructor gọn: kiểm tra bất biến. PENDING không được có {@code confirmedBy/confirmedAt/reference}; CONFIRMED bắt buộc có đủ cả ba (reference không rỗng).
     * @throws NullPointerException     khi thiếu {@code sessionId}, {@code beneficiaryId}, {@code status} hoặc dữ liệu bắt buộc của CONFIRMED
     * @throws IllegalArgumentException khi vi phạm bất biến ở trên
     */
    public BeneficiaryConfirmation {
        Objects.requireNonNull(sessionId, "sessionId");
        Objects.requireNonNull(beneficiaryId, "beneficiaryId");
        Objects.requireNonNull(status, "status");
        if (status == Status.PENDING) {
            if (confirmedBy != null || confirmedAt != null || reference != null) {
                throw new IllegalArgumentException("Pending confirmation cannot carry confirmation evidence");
            }
        } else {
            Objects.requireNonNull(confirmedBy, "confirmedBy");
            Objects.requireNonNull(confirmedAt, "confirmedAt");
            if (reference == null || reference.isBlank()) {
                throw new IllegalArgumentException("Confirmed beneficiary requires a reference");
            }
        }
    }

    /**
     * Tạo xác nhận ở trạng thái chờ cho một người nhận trong một phiên.
     * @param sessionId     id phiên bàn giao
     * @param beneficiaryId id người nhận
     * @return bản ghi PENDING không có bằng chứng
     */
    public static BeneficiaryConfirmation pending(UUID sessionId, UUID beneficiaryId) {
        return new BeneficiaryConfirmation(sessionId, beneficiaryId, Status.PENDING, null, null, null);
    }

    // A receipt/reference may be sensitive; do not include it in diagnostic output.
    /**
     * Chuỗi chẩn đoán; cố ý không in {@code reference}, {@code confirmedBy}, {@code confirmedAt} để tránh lộ dữ liệu nhạy cảm.
     */
    @Override
    public String toString() {
        return "BeneficiaryConfirmation[sessionId=" + sessionId + ", beneficiaryId=" + beneficiaryId
                + ", status=" + status + "]";
    }
}
