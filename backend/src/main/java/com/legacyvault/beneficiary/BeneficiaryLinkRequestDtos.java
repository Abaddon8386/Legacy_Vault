package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * BE-01: link requests (recipient side) and counter confirmation (Staff side).
 *
 * Nhóm DTO của luồng yêu cầu liên kết: phía người nhận ({@code BeneficiaryLinkRequestController}, {@code /api/v1/beneficiary-link-requests})
 * và phía Staff ({@code StaffLinkRequestController}, {@code /api/v1/staff/verification-cases/{caseId}/...}).
 */
public final class BeneficiaryLinkRequestDtos {

	/**
	 * Lớp tiện ích chứa record lồng nhau, không cho khởi tạo.
	 */
	private BeneficiaryLinkRequestDtos() { }

	/**
	 * The recipient only types the case code (for example HS-2026-000123).
	 *
	 * Body của {@code POST /api/v1/beneficiary-link-requests}: {@code caseCode} là mã hồ sơ dạng {@code HS-yyyy-n} (bắt buộc, tối đa 30 ký tự).
	 */
	public record SubmitRequest(
			@NotBlank(message = "validation.NotBlank")
			@Size(max = 30, message = "validation.Size") String caseCode) { }

	/**
	 * What the requester sees about their own request. Deliberately carries no case, vault or recipient data.
	 *
	 * Trường: {@code requestId} mã công khai, {@code status} trạng thái hiệu lực (PENDING, APPROVED, REJECTED, CANCELLED, EXPIRED),
	 * {@code createdAt} và {@code expiresAt} dạng Instant UTC.
	 */
	public record MyRequest(UUID requestId, String status, Instant createdAt, Instant expiresAt) {
		/**
		 * Dựng {@code MyRequest}; trạng thái tính theo {@code effectiveStatus(now)}.
		 */
		static MyRequest from(BeneficiaryLinkRequest request, java.time.LocalDateTime now) {
			return new MyRequest(request.getPublicId(), request.effectiveStatus(now),
					request.getCreatedAt().toInstant(ZoneOffset.UTC), request.getExpiresAt().toInstant(ZoneOffset.UTC));
		}
	}

	/**
	 * Staff view of a pending request: enough to compare the person at the counter with the account.
	 *
	 * Trường: {@code requestId}, {@code status}, {@code requesterName} và {@code requesterEmail} của tài khoản yêu cầu, {@code createdAt}, {@code expiresAt}.
	 * Trả về bởi {@code GET /api/v1/staff/verification-cases/{caseId}/link-requests}.
	 */
	public record StaffRequest(UUID requestId, String status, String requesterName, String requesterEmail,
			Instant createdAt, Instant expiresAt) { }

	/**
	 * Staff picks the recipient. The target account is never part of the body; it comes from the stored request.
	 *
	 * Body của {@code POST .../link-requests/{requestId}/approve}: {@code beneficiaryId} là mã công khai người thụ hưởng Staff chọn.
	 */
	public record ApproveRequest(@NotNull(message = "validation.NotNull") UUID beneficiaryId) { }

	/**
	 * Kết quả duyệt/từ chối: {@code requestId}, {@code status} mới, {@code beneficiaryId} và {@code accountId} (null khi từ chối).
	 */
	public record Decision(UUID requestId, String status, UUID beneficiaryId, UUID accountId) { }

	/**
	 * Create an account at the counter without linking it. The person chooses their own password.
	 *
	 * Body của {@code POST /api/v1/staff/verification-cases/{caseId}/accounts}: {@code email}, {@code fullName}, {@code password} (8-72 ký tự, chỉ lưu băm)
	 * và {@code phone} tùy chọn (rỗng hoặc 8-15 chữ số).
	 */
	public record CreateAccountRequest(
			@NotBlank(message = "validation.NotBlank")
			@jakarta.validation.constraints.Email(message = "validation.Email")
			@Size(max = 254, message = "validation.Size") String email,
			@NotBlank(message = "validation.NotBlank")
			@Size(max = 150, message = "validation.Size") String fullName,
			@NotBlank(message = "validation.NotBlank")
			@Size(min = 8, max = 72, message = "validation.Size") String password,
			@Pattern(regexp = "^$|^\\+?[0-9]{8,15}$", message = "validation.Pattern") String phone) {
		/**
		 * Keep the secret out of any accidental toString/log output.
		 *
		 * Che mật khẩu khi in log.
		 */
		@Override
		public String toString() {
			return "CreateAccountRequest[email=" + email + ", password=<redacted>]";
		}
	}

	/**
	 * Kết quả tạo tài khoản: {@code accountId} mã công khai, {@code linkStatus} luôn là {@code UNLINKED}.
	 */
	public record CreatedAccount(UUID accountId, String linkStatus) { }
}
