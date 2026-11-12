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
 *
 * Được {@code DistributionWorkflowController} (Staff và Legal) trả về/nhận vào. Lớp này chỉ gom các record lồng nhau.
 */
public final class DistributionWorkflowDtos {

    private DistributionWorkflowDtos() { }

    /**
     * Điều kiện tiên quyết: giấy chứng tử đã được duyệt ({@code deathApproved}) và đối chiếu di chúc khớp ({@code willMatched}).
     */
    public record Prerequisites(boolean deathApproved, boolean willMatched) { }

    /**
     * Yêu cầu đang mở của Legal gửi Staff: {@code id} và {@code reason}.
     */
    public record RequestInfo(UUID id, String reason) { }

    /**
     * Latest forwarded document version; status is PENDING, APPROVED or CHANGES_REQUESTED.
     *
     * Thông tin văn bản đã chuyển.
     */
    public record DocumentInfo(int version, String sha256, String status) { }

    /**
     * Một dòng trong phương án phân chia: tài sản, người nhận, tên hiển thị và mô tả.
     */
    public record AllocationItem(UUID assetId, UUID beneficiaryId, String assetName, String recipientName, String description) { }

    /**
     * Status is SUBMITTED, APPROVED or CHANGES_REQUESTED; documentVersion is the document the allocation was prepared for.
     *
     * Phương án phân chia hiện hành kèm danh sách {@code items}.
     */
    public record AllocationInfo(int version, int documentVersion, String sha256, String status, List<AllocationItem> items) { }

    /**
     * blockedReason is null exactly when allowed.
     *
     * Khả năng thực hiện một hành động: {@code allowed} và lý do bị chặn.
     */
    public record Capability(boolean allowed, String blockedReason) { }

    /**
     * Response của {@code GET .../distribution-workflow}.
     *
     * - {@code caseId}, {@code revision}: ca và số revision để chống ghi đè đồng thời.
     * - {@code phase}: giai đoạn do server tính.
     * - {@code prerequisites}, {@code request}, {@code document}, {@code allocation}: các snapshot hiện tại.
     * - {@code capabilities}: bản đồ tên hành động sang {@link Capability}.
     * - {@code feedback}: phản hồi/ghi chú gần nhất.
     */
    public record View(UUID caseId, long revision, String phase, Prerequisites prerequisites, RequestInfo request,
            DocumentInfo document, AllocationInfo allocation, java.util.Map<String, Capability> capabilities,
            String feedback) { }

    /**
     * Body of every POST action; which fields are required depends on the action and is checked by the service.
     *
     * Các trường: {@code revision} (bắt buộc, chống xung đột), {@code reason}, {@code documentVersion},
     * {@code documentSha256}, {@code allocationVersion}, {@code allocationSha256} (hash 64 ký tự hex) và
     * {@code allocations} (tối đa 200 {@link AllocationInput}).
     */
    public record ActionBody(
            @NotNull @Min(0) Long revision,
            @Size(max = 1000) String reason,
            @Min(1) Integer documentVersion,
            @Pattern(regexp = "(?i)[a-f0-9]{64}") String documentSha256,
            @Min(1) Integer allocationVersion,
            @Pattern(regexp = "(?i)[a-f0-9]{64}") String allocationSha256,
            @Size(max = 200) List<@Valid AllocationInput> allocations) { }

    /**
     * Kết quả của một hành động: {@code caseId}, {@code action} đã thực hiện, {@code revision} mới và biên nhận thông báo.
     */
    public record Receipt(UUID caseId, String action, long revision,
            com.legacyvault.notification.WorkflowNotificationService.Receipt notification) { }
}
