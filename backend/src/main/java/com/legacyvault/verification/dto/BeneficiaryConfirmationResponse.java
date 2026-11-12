package com.legacyvault.verification.dto;
import java.time.Instant;
import java.util.UUID;
/**
 * Kết quả {@code GET .../handover-sessions/{sessionId}/beneficiary-confirmations} và
 * {@code POST .../beneficiaries/{beneficiaryId}/confirmation}.
 *
 * Các trường: {@code confirmationId}, {@code sessionId}, {@code beneficiaryId} (UUID công khai), {@code status},
 * {@code confirmedBy}, {@code confirmedAt}, {@code receiptReference} (số tham chiếu giấy), {@code hasSignedFile}
 * (đã nộp file xác nhận có chữ ký hay chưa).
 */
public record BeneficiaryConfirmationResponse(UUID confirmationId, UUID sessionId, UUID beneficiaryId,
        String status, UUID confirmedBy, Instant confirmedAt, String receiptReference, boolean hasSignedFile) {
 /**
  * Constructor rút gọn: {@code hasSignedFile=false}.
  */
 public BeneficiaryConfirmationResponse(UUID confirmationId,UUID sessionId,UUID beneficiaryId,String status,UUID confirmedBy,Instant confirmedAt,String receiptReference){this(confirmationId,sessionId,beneficiaryId,status,confirmedBy,confirmedAt,receiptReference,false);}
}
