package com.legacyvault.beneficiary;

import java.util.UUID;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * DTO cho yêu cầu Staff xếp hàng email mời (PS-106), dùng bởi {@code StaffInvitationEmailController} và {@code StaffInvitationEmailService}.
 */
public final class InvitationEmailDtos {
    /**
     * Lớp tiện ích, không cho khởi tạo.
     */
    private InvitationEmailDtos() { }

    /**
     * The generation observed by Staff; 0 means no invitation exists yet.
     *
     * Body của {@code POST .../invitation-email}: {@code expectedGeneration} thế hệ mã Staff đang thấy (tối thiểu 0).
     */
    public record Request(@NotNull @Min(0) Integer expectedGeneration) { }

    /**
     * Kết quả (HTTP 202): {@code outboxId} mã dòng outbox, {@code invitationId}, {@code invitationGeneration}, {@code queueStatus} và
     * {@code transportStatus} (luôn {@code DISABLED} vì dịch vụ gửi mail đang tắt).
     */
    public record Queued(UUID outboxId, UUID invitationId, int invitationGeneration,
            String queueStatus, String transportStatus) { }
}
