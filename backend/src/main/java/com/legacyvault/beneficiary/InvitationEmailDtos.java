package com.legacyvault.beneficiary;

import java.util.UUID;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public final class InvitationEmailDtos {
    private InvitationEmailDtos() { }

    /** The generation observed by Staff; 0 means no invitation exists yet. */
    public record Request(@NotNull @Min(0) Integer expectedGeneration) { }

    public record Queued(UUID outboxId, UUID invitationId, int invitationGeneration,
            String queueStatus, String transportStatus) { }
}
