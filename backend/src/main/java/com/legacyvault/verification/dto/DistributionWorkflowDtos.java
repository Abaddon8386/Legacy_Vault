package com.legacyvault.verification.dto;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Hợp đồng workflow phân chia (PR #226): phase do server suy ra, snapshot tài liệu và phân bổ hiện hành, và
 * một capability cho mỗi action. Client không bao giờ gửi phase; nó gửi revision và snapshot mà nó đã xem.
 */
public final class DistributionWorkflowDtos {

    private DistributionWorkflowDtos() { }

    // Điều kiện tiên quyết: giấy chứng tử đã được duyệt (deathApproved) và di chúc đã khớp (willMatched).
    public record Prerequisites(boolean deathApproved, boolean willMatched) { }

    // Yêu cầu bổ sung giấy tờ hiện hành và lý do.
    public record RequestInfo(UUID id, String reason) { }

    /** Phiên bản tài liệu đã chuyển tiếp mới nhất; status là PENDING, APPROVED hoặc CHANGES_REQUESTED. */
    public record DocumentInfo(int version, String sha256, String status) { }

    // Một dòng phân bổ: tài sản nào cho người nhận nào (chỉ ID công khai).
    public record AllocationItem(UUID assetId, UUID beneficiaryId, String assetName, String recipientName, String description) { }

    /** Status là SUBMITTED, APPROVED hoặc CHANGES_REQUESTED; documentVersion là tài liệu mà phân bổ được chuẩn bị cho. */
    public record AllocationInfo(int version, int documentVersion, String sha256, String status, List<AllocationItem> items) { }

    /** blockedReason là null đúng khi allowed. */
    public record Capability(boolean allowed, String blockedReason) { }

    /**
     * Ảnh chụp trạng thái workflow phân chia của một ca: phase do server suy ra từ chuỗi event,
     * revision dùng làm khóa lạc quan cho action kế tiếp, capabilities cho biết action nào được phép và lý do bị chặn.
     */
    public record View(UUID caseId, long revision, String phase, Prerequisites prerequisites, RequestInfo request,
            DocumentInfo document, AllocationInfo allocation, java.util.Map<String, Capability> capabilities,
            String feedback) { }

    /** Body của mọi action POST; trường nào bắt buộc tùy action và do service kiểm tra. */
    public record ActionBody(
            @NotNull @Min(0) Long revision,
            @Size(max = 1000) String reason,
            @Min(1) Integer documentVersion,
            @Pattern(regexp = "(?i)[a-f0-9]{64}") String documentSha256,
            @Min(1) Integer allocationVersion,
            @Pattern(regexp = "(?i)[a-f0-9]{64}") String allocationSha256,
            @Size(max = 200) List<@Valid AllocationInput> allocations) { }

    // Kết quả của một action: ca, tên action, revision mới và biên nhận thông báo.
    public record Receipt(UUID caseId, String action, long revision,
            com.legacyvault.notification.WorkflowNotificationService.Receipt notification) { }
}
