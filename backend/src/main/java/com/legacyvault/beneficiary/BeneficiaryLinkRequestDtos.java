package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** BE-01: yêu cầu liên kết (phía người nhận) và xác nhận tại quầy (phía Staff). */
public final class BeneficiaryLinkRequestDtos {

	private BeneficiaryLinkRequestDtos() { }

	/** Người nhận chỉ gõ mã hồ sơ (ví dụ HS-2026-000123). */
	public record SubmitRequest(
			@NotBlank(message = "validation.NotBlank")
			@Size(max = 30, message = "validation.Size") String caseCode) { }

	/** Những gì người gửi thấy về yêu cầu của chính mình. Cố ý không chứa dữ liệu hồ sơ, vault hay người nhận. */
	public record MyRequest(UUID requestId, String status, Instant createdAt, Instant expiresAt) {
		static MyRequest from(BeneficiaryLinkRequest request, java.time.LocalDateTime now) {
			return new MyRequest(request.getPublicId(), request.effectiveStatus(now),
					request.getCreatedAt().toInstant(ZoneOffset.UTC), request.getExpiresAt().toInstant(ZoneOffset.UTC));
		}
	}

	/** Góc nhìn Staff của yêu cầu đang chờ: đủ để so người tại quầy với tài khoản. */
	public record StaffRequest(UUID requestId, String status, String requesterName, String requesterEmail,
			Instant createdAt, Instant expiresAt) { }

	/** Staff chọn người nhận. Tài khoản đích không bao giờ nằm trong body; nó lấy từ yêu cầu đã lưu. */
	public record ApproveRequest(@NotNull(message = "validation.NotNull") UUID beneficiaryId) { }

	public record Decision(UUID requestId, String status, UUID beneficiaryId, UUID accountId) { }

	/** Tạo tài khoản tại quầy mà không liên kết. Người đó tự chọn mật khẩu. */
	public record CreateAccountRequest(
			@NotBlank(message = "validation.NotBlank")
			@jakarta.validation.constraints.Email(message = "validation.Email")
			@Size(max = 254, message = "validation.Size") String email,
			@NotBlank(message = "validation.NotBlank")
			@Size(max = 150, message = "validation.Size") String fullName,
			@NotBlank(message = "validation.NotBlank")
			@Size(min = 8, max = 72, message = "validation.Size") String password,
			@Pattern(regexp = "^$|^\\+?[0-9]{8,15}$", message = "validation.Pattern") String phone) {
		/** Giữ bí mật khỏi mọi đầu ra toString/log vô tình. */
		@Override
		public String toString() {
			return "CreateAccountRequest[email=" + email + ", password=<redacted>]";
		}
	}

	public record CreatedAccount(UUID accountId, String linkStatus) { }
}
