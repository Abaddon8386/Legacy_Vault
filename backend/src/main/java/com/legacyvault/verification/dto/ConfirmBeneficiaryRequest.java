package com.legacyvault.verification.dto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
/**
 * Request xác nhận người thụ hưởng với số tham chiếu giấy {@code receiptReference} (bắt buộc, tối đa 200 ký tự).
 */
public record ConfirmBeneficiaryRequest(@NotBlank @Size(max=200) String receiptReference) {}
