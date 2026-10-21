package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class InvitationDtos {
    private InvitationDtos() { }
    public record ReissueRequest(@NotNull @Min(1) Integer generation) { }
    public record RedeemRequest(@NotBlank @Size(max = 128) String code) {
        @Override public String toString() { return "RedeemRequest[code=<redacted>]"; }
    }
    public record Metadata(UUID invitationId, UUID beneficiaryId, String state, Integer generation,
            Instant issuedAt, Instant expiresAt, Instant revokedAt, Instant consumedAt) {
        static Metadata from(BeneficiaryInvitation invitation, UUID beneficiaryId, LocalDateTime now) {
            if (invitation == null) return new Metadata(null, beneficiaryId, "NOT_ISSUED", null, null, null, null, null);
            return new Metadata(invitation.getPublicId(), beneficiaryId, invitation.state(now), invitation.getGeneration(),
                    instant(invitation.getIssuedAt()), instant(invitation.getExpiresAt()), instant(invitation.getRevokedAt()),
                    instant(invitation.getConsumedAt()));
        }
    }
    public record Issued(Metadata invitation, String code) {
        @Override public String toString() { return "Issued[invitation=" + invitation + ", code=<redacted>]"; }
    }
    public record Linked(UUID beneficiaryId, UUID accountId, String accountStatus) { }
    private static Instant instant(LocalDateTime time) { return time == null ? null : time.toInstant(ZoneOffset.UTC); }
}
