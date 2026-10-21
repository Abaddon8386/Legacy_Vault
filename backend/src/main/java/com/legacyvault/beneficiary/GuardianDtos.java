package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import jakarta.validation.constraints.*;

public final class GuardianDtos {
    private GuardianDtos() {}
    public record UpsertRequest(@NotNull(message="validation.NotNull") @Min(value=0, message="validation.Min") Long expectedRevision,
            @NotBlank(message="validation.NotBlank") @Size(message="validation.Size", max=150) String fullName,
            @NotBlank(message="validation.NotBlank") @Size(message="validation.Size", max=100) String relationship,
            @Email(message="validation.Email") @Size(message="validation.Size", max=254) String email,
            @Size(message="validation.Size", max=20) String phone) {}
    public record RevokeRequest(@NotNull(message="validation.NotNull") @Min(value=0, message="validation.Min") Long expectedRevision) {}
    public record Guardian(UUID id, long revision, String fullName, String relationship,
            String email, String phone, Instant createdAt, Instant endedAt, String endReason) {}
    public record Context(UUID beneficiaryId, long revision, LocalDate evaluatedOn, String timeZone,
            String ageStatus, boolean guardianRecommended, String warningCode, Guardian guardian) {}
}
