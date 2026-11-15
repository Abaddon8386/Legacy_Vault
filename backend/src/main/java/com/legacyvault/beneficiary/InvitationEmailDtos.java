package com.legacyvault.beneficiary;

import java.util.UUID;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public final class InvitationEmailDtos {
    private InvitationEmailDtos() { }

    /** Generation mà Staff đang thấy; 0 nghĩa là chưa có lời mời nào. */
    public record Request(@NotNull @Min(0) Integer expectedGeneration) { }

    /** Kết quả xếp hàng gửi mail. {@code transportStatus} là trạng thái của outbox; phản hồi luôn kèm DISABLED vì transport thư chưa bật. */
    public record Queued(UUID outboxId, UUID invitationId, int invitationGeneration,
            String queueStatus, String transportStatus) { }
}
