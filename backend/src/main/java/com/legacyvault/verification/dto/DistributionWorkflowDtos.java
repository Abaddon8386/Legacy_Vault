package com.legacyvault.verification.dto;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Distribution workflow contract (PR #226): the server-derived phase, the current document and allocation snapshots and
 * one capability per action. The client never supplies a phase; it supplies the revision and snapshot it looked at.
 */
public final class DistributionWorkflowDtos {

    private DistributionWorkflowDtos() { }

    public record Prerequisites(boolean deathApproved, boolean willMatched) { }

    public record RequestInfo(UUID id, String reason) { }

    /** Latest forwarded document version; status is PENDING, APPROVED or CHANGES_REQUESTED. */
    public record DocumentInfo(int version, String sha256, String status) { }

    public record AllocationItem(UUID assetId, UUID beneficiaryId, String assetName, String recipientName, String description) { }

    /** Status is SUBMITTED, APPROVED or CHANGES_REQUESTED; documentVersion is the document the allocation was prepared for. */
    public record AllocationInfo(int version, int documentVersion, String sha256, String status, List<AllocationItem> items) { }

    /** blockedReason is null exactly when allowed. */
    public record Capability(boolean allowed, String blockedReason) { }

    public record View(UUID caseId, long revision, String phase, Prerequisites prerequisites, RequestInfo request,
            DocumentInfo document, AllocationInfo allocation, java.util.Map<String, Capability> capabilities,
            String feedback) { }

    /** Body of every POST action; which fields are required depends on the action and is checked by the service. */
    public record ActionBody(
            @NotNull @Min(0) Long revision,
            @Size(max = 1000) String reason,
            @Min(1) Integer documentVersion,
            @Pattern(regexp = "(?i)[a-f0-9]{64}") String documentSha256,
            @Min(1) Integer allocationVersion,
            @Pattern(regexp = "(?i)[a-f0-9]{64}") String allocationSha256,
            @Size(max = 200) List<@Valid AllocationInput> allocations) { }

    public record Receipt(UUID caseId, String action, long revision) { }
}
