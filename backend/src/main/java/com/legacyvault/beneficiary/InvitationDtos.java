package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Nhóm DTO cho mã mời liên kết tài khoản người thụ hưởng ({@code BeneficiaryInvitationController}, {@code InvitationRedeemController}).
 */
public final class InvitationDtos {
    /**
     * Lớp tiện ích, không cho khởi tạo.
     */
    private InvitationDtos() { }
    /**
     * Body của {@code POST .../invitation/reissue}: {@code generation} là thế hệ mã client đang thấy (tối thiểu 1).
     */
    public record ReissueRequest(@NotNull @Min(1) Integer generation) { }
    /**
     * Body của {@code POST /api/v1/auth/invitations/redeem}: {@code code} là mã mời thô (tối đa 128 ký tự); {@code toString} che mã.
     */
    public record RedeemRequest(@NotBlank @Size(max = 128) String code) {
        @Override public String toString() { return "RedeemRequest[code=<redacted>]"; }
    }
    /**
     * Metadata mã mời (không chứa mã thô): {@code invitationId}, {@code beneficiaryId}, {@code state} (NOT_ISSUED, PENDING, EXPIRED, REVOKED, CONSUMED),
     * {@code generation} và các mốc {@code issuedAt}, {@code expiresAt}, {@code revokedAt}, {@code consumedAt}.
     */
    public record Metadata(UUID invitationId, UUID beneficiaryId, String state, Integer generation,
            Instant issuedAt, Instant expiresAt, Instant revokedAt, Instant consumedAt) {
        /**
         * Dựng metadata; nếu {@code invitation} null thì trả trạng thái {@code NOT_ISSUED}.
         */
        static Metadata from(BeneficiaryInvitation invitation, UUID beneficiaryId, LocalDateTime now) {
            if (invitation == null) return new Metadata(null, beneficiaryId, "NOT_ISSUED", null, null, null, null, null);
            return new Metadata(invitation.getPublicId(), beneficiaryId, invitation.state(now), invitation.getGeneration(),
                    instant(invitation.getIssuedAt()), instant(invitation.getExpiresAt()), instant(invitation.getRevokedAt()),
                    instant(invitation.getConsumedAt()));
        }
    }
    /**
     * Kết quả cấp mã: {@code invitation} metadata và {@code code} mã thô, chỉ xuất hiện đúng một lần trong phản hồi; {@code toString} che mã.
     */
    public record Issued(Metadata invitation, String code) {
        @Override public String toString() { return "Issued[invitation=" + invitation + ", code=<redacted>]"; }
    }
    /**
     * Kết quả đổi mã thành công: mã công khai người thụ hưởng, mã tài khoản đã liên kết và trạng thái tài khoản.
     */
    public record Linked(UUID beneficiaryId, UUID accountId, String accountStatus) { }
    /**
     * Đổi {@code LocalDateTime} UTC sang {@code Instant}; null nếu đầu vào null.
     */
    private static Instant instant(LocalDateTime time) { return time == null ? null : time.toInstant(ZoneOffset.UTC); }
}
