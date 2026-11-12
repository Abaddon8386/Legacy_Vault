package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.legacyvault.user.entity.User;

/**
 * Nhóm DTO cho API xác minh danh tính tại quầy ({@code IdentityVerificationController}).
 */
public final class IdentityVerificationDtos {

	/**
	 * Lớp tiện ích, không cho khởi tạo.
	 */
	private IdentityVerificationDtos() { }

	/**
	 * Loại giấy tờ được đối chiếu: căn cước công dân hoặc hộ chiếu.
	 */
	public enum DocumentType { CCCD, PASSPORT }
	/**
	 * Kết quả đối chiếu: khớp hoặc không khớp.
	 */
	public enum Result { MATCH, NOT_MATCH }

	/**
	 * Body của {@code POST .../identity-verifications}: {@code documentType} (bắt buộc), {@code issuingAuthority} nơi cấp (tối đa 150),
	 * {@code documentSuffix} 4 ký tự cuối của số giấy tờ (chữ hoặc số) và {@code result} (bắt buộc).
	 */
	public record Request(@NotNull(message = "validation.NotNull") DocumentType documentType,
			@Size(max = 150, message = "validation.Size") String issuingAuthority,
			@Pattern(regexp = "^[0-9A-Za-z]{4}$", message = "validation.Pattern") String documentSuffix,
			@NotNull(message = "validation.NotNull") Result result) { }

	/**
	 * Thông tin Staff đã xác minh: mã công khai và họ tên.
	 */
	public record Verifier(UUID id, String fullName) { }

	/**
	 * Một lần xác minh: {@code id}, {@code beneficiaryId}, {@code documentType}, {@code issuingAuthority}, {@code documentSuffix}, {@code result},
	 * {@code verifiedBy} ({@code Verifier}) và {@code verifiedAt} (ISO-8601 UTC).
	 */
	public record Response(UUID id, UUID beneficiaryId, DocumentType documentType, String issuingAuthority,
			String documentSuffix, Result result, Verifier verifiedBy, String verifiedAt) {
		/**
		 * Dựng {@code Response} từ bản ghi xác minh và Staff thực hiện.
		 */
		static Response from(IdentityVerificationRecord record, User actor) {
			return new Response(record.getPublicId(), record.getBeneficiary().getPublicId(),
					DocumentType.valueOf(record.getDocumentType()), record.getIssuingAuthority(), record.getDocumentSuffix(),
					Result.valueOf(record.getResult()), new Verifier(actor.getPublicId(), actor.getFullName()),
					utc(record.getVerifiedAt()));
		}
		/**
		 * Đổi {@code LocalDateTime} UTC sang chuỗi ISO-8601; null nếu đầu vào null.
		 */
		private static String utc(LocalDateTime value) {
			return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
		}
	}
}
