package com.legacyvault.verification.dto;
import java.time.Instant;
import java.util.UUID;
public record BeneficiaryConfirmationResponse(UUID confirmationId, UUID sessionId, UUID beneficiaryId,
        String status, UUID confirmedBy, Instant confirmedAt, String receiptReference, boolean hasSignedFile) {
 public BeneficiaryConfirmationResponse(UUID confirmationId,UUID sessionId,UUID beneficiaryId,String status,UUID confirmedBy,Instant confirmedAt,String receiptReference){this(confirmationId,sessionId,beneficiaryId,status,confirmedBy,confirmedAt,receiptReference,false);}
}
