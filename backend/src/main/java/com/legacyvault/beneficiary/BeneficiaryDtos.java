package com.legacyvault.beneficiary;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Nhóm DTO của API quản lý người thụ hưởng cho Owner ({@code BeneficiaryController}, {@code VaultConfigurationController}).
 */
public final class BeneficiaryDtos {
	/**
	 * Lớp tiện ích chứa record lồng nhau, không cho khởi tạo.
	 */
	private BeneficiaryDtos() { }

	/**
	 * Body của {@code POST} và {@code PUT /api/v1/vaults/{vaultId}/beneficiaries[/{beneficiaryId}]}.
	 * <ul>
	 * <li>{@code fullName}: họ tên (bắt buộc, tối đa 150).</li>
	 * <li>{@code relationship}: quan hệ với chủ kho (tối đa 100).</li>
	 * <li>{@code dateOfBirth}: ngày sinh, không được ở tương lai ({@code BeneficiaryBirthDate}).</li>
	 * <li>{@code phone}: số điện thoại (tối đa 20).</li>
	 * <li>{@code email}: email hợp lệ (tối đa 254); đổi email sẽ thu hồi lời mời đang hiệu lực.</li>
	 * <li>{@code identityNumber}: số giấy tờ định danh (tối đa 100), được mã hóa khi lưu; để trống khi cập nhật thì giữ số cũ.</li>
	 * </ul>
	 */
	public record UpsertRequest(
			@NotBlank(message = "validation.NotBlank") @Size(max = 150, message = "validation.Size") String fullName,
			@Size(max = 100, message = "validation.Size") String relationship,
			@BeneficiaryBirthDate LocalDate dateOfBirth,
			@Size(max = 20, message = "validation.Size") String phone,
			@Email(message = "validation.Email") @Size(max = 254, message = "validation.Size") String email,
			@Size(max = 100, message = "validation.Size") String identityNumber) {
	}

	/**
	 * Dữ liệu người thụ hưởng trả về cho Owner.
	 * <ul>
	 * <li>{@code id}: mã công khai người thụ hưởng; {@code vaultId}: mã công khai Vault.</li>
	 * <li>{@code fullName}, {@code relationship}, {@code dateOfBirth}, {@code phone}, {@code email}: thông tin hồ sơ.</li>
	 * <li>{@code hasIdentityNumber}: đã lưu số giấy tờ hay chưa (không trả số thật).</li>
	 * <li>{@code hasAccount}: đã liên kết tài khoản hay chưa.</li>
	 * <li>{@code status}: trạng thái chỉ định; {@code createdAt}/{@code updatedAt}: thời điểm ISO-8601 UTC.</li>
	 * </ul>
	 */
	public record Response(UUID id, UUID vaultId, String fullName, String relationship, LocalDate dateOfBirth,
			String phone, String email, boolean hasIdentityNumber, boolean hasAccount, String status,
			String createdAt, String updatedAt) {
		/**
		 * Chuyển thực thể {@code Beneficiary} thành {@code Response}.
		 */
		public static Response from(Beneficiary beneficiary) {
			return new Response(beneficiary.getPublicId(), beneficiary.getVault().getPublicId(), beneficiary.getFullName(),
					beneficiary.getRelationship(), beneficiary.getDateOfBirth(), beneficiary.getPhone(), beneficiary.getEmail(),
					beneficiary.hasIdentityNumber(), beneficiary.hasAccount(), beneficiary.getStatus(),
					utc(beneficiary.getCreatedAt()), utc(beneficiary.getUpdatedAt()));
		}
	}

	/**
	 * Một vấn đề cấu hình của Vault: mã lỗi {@code code}, khóa i18n {@code messageKey} và nội dung đã dịch {@code message}.
	 */
	public record ConfigurationIssue(String code, String messageKey, String message) { }
	/**
	 * Kết quả của {@code GET /api/v1/vaults/{vaultId}/configuration-check}.
	 * <ul>
	 * <li>{@code vaultId}: mã công khai Vault.</li>
	 * <li>{@code ready}: {@code true} nếu đã có ít nhất một người thụ hưởng.</li>
	 * <li>{@code beneficiaryCount}: số người thụ hưởng hiện có.</li>
	 * <li>{@code issues}: danh sách vấn đề (rỗng nếu {@code ready}).</li>
	 * </ul>
	 */
	public record ConfigurationCheck(UUID vaultId, boolean ready, long beneficiaryCount, List<ConfigurationIssue> issues) {
		/**
		 * Hàm khởi tạo gọn: sao chép bất biến danh sách {@code issues}.
		 */
		public ConfigurationCheck {
			issues = List.copyOf(issues);
		}
	}

	/**
	 * Đổi {@code LocalDateTime} (UTC) sang chuỗi ISO-8601; trả null nếu đầu vào null.
	 */
	private static String utc(LocalDateTime value) {
		return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
	}
}
