package com.legacyvault.verification.dto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
public record ConfirmBeneficiaryRequest(@NotBlank @Size(max=200) String receiptReference) {}
