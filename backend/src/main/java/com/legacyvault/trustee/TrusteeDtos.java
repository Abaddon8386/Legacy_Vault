package com.legacyvault.trustee;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * DTO của API Trustee (Owner): request tạo / cập nhật và response.
 */
public final class TrusteeDtos {
	/**
	 * Lớp tiện ích, không khởi tạo.
	 */
	private TrusteeDtos() { }

	/**
	 * Body {@code POST /api/v1/trustees}: bổ nhiệm Trustee. Phải có ít nhất điện thoại hoặc email ({@link #isContactProvided()}).
	 *
	 * <ul>
	 * <li>{@code vaultId} - public id Vault, bắt buộc</li>
	 * <li>{@code fullName} - họ tên, bắt buộc, tối đa 150</li>
	 * <li>{@code phone} - tối đa 20; {@code email} - hợp lệ, tối đa 254</li>
	 * <li>{@code relationship} - tối đa 100; {@code note} - tối đa 500</li>
	 * </ul>
	 */
	public record CreateRequest(
			@NotNull(message = "validation.NotNull") UUID vaultId,
			@NotBlank(message = "validation.NotBlank") @Size(max = 150, message = "validation.Size") String fullName,
			@Size(max = 20, message = "validation.Size") String phone,
			@Email(message = "validation.Email") @Size(max = 254, message = "validation.Size") String email,
			@Size(max = 100, message = "validation.Size") String relationship,
			@Size(max = 500, message = "validation.Size") String note) {
		/**
		 * Ràng buộc: phải có ít nhất một trong điện thoại hoặc email, nếu không trả 400 VALIDATION_FAILED.
		 *
		 * @return true nếu có liên hệ
		 */
		@AssertTrue(message = "validation.contactRequired")
		public boolean isContactProvided() {
			return (phone != null && !phone.isBlank()) || (email != null && !email.isBlank());
		}
	}

	/**
	 * Body {@code PUT /api/v1/trustees/{trusteeId}}: cập nhật thông tin Trustee (cùng các trường như {@link CreateRequest} nhưng không có {@code vaultId}); vẫn phải còn điện thoại hoặc email.
	 */
	public record UpdateRequest(
			@NotBlank(message = "validation.NotBlank") @Size(max = 150, message = "validation.Size") String fullName,
			@Size(max = 20, message = "validation.Size") String phone,
			@Email(message = "validation.Email") @Size(max = 254, message = "validation.Size") String email,
			@Size(max = 100, message = "validation.Size") String relationship,
			@Size(max = 500, message = "validation.Size") String note) {
		/**
		 * Ràng buộc: phải có ít nhất một trong điện thoại hoặc email.
		 *
		 * @return true nếu có liên hệ
		 */
		@AssertTrue(message = "validation.contactRequired")
		public boolean isContactProvided() {
			return (phone != null && !phone.isBlank()) || (email != null && !email.isBlank());
		}
	}

	/**
	 * Response Trustee.
	 *
	 * <ul>
	 * <li>{@code id} - public id Trustee; {@code vaultId} - public id Vault</li>
	 * <li>{@code fullName}, {@code phone}, {@code email}, {@code relationship}, {@code note}</li>
	 * <li>{@code status} - APPOINTED / REVOKED</li>
	 * <li>{@code appointedAt}, {@code revokedAt}, {@code updatedAt} - ISO-8601 UTC (revokedAt có thể null)</li>
	 * </ul>
	 */
	public record Response(UUID id, UUID vaultId, String fullName, String phone, String email,
			String relationship, String note, String status, String appointedAt, String revokedAt, String updatedAt) {
		/**
		 * Dựng response từ entity {@link Trustee}.
		 */
		public static Response from(Trustee trustee) {
			return new Response(trustee.getPublicId(), trustee.getVault().getPublicId(), trustee.getFullName(),
					trustee.getPhone(), trustee.getEmail(), trustee.getRelationship(), trustee.getNote(), trustee.getStatus(),
					utc(trustee.getAppointedAt()), utc(trustee.getRevokedAt()), utc(trustee.getUpdatedAt()));
		}
	}

	/**
	 * Chuyển thời gian UTC sang chuỗi ISO-8601; null giữ nguyên.
	 */
	private static String utc(LocalDateTime value) {
		return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
	}
}
