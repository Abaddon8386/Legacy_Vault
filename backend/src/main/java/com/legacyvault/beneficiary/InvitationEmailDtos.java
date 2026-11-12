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
     * Body của {@code POST .../invitation-email}: {@code expectedGeneration} thế hệ mã Staff đang thấy (tối thiểu 0; 0 nghĩa là chưa có mã mời nào).
     */
    public record Request(@NotNull @Min(0) Integer expectedGeneration) { }

    /**
     * Kết quả (HTTP 202): {@code outboxId} mã công khai dòng outbox, {@code invitationId} mã công khai lời mời, {@code invitationGeneration} thế hệ
     * lời mời, {@code queueStatus} trạng thái dòng outbox (hiện là {@code QUEUED}) và {@code transportStatus} (luôn {@code DISABLED} vì
     * dịch vụ gửi mail đang tắt).
     */
    public record Queued(UUID outboxId, UUID invitationId, int invitationGeneration,
            String queueStatus, String transportStatus) { }
}
