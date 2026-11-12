package com.legacyvault.beneficiary;

import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * PS-62/PS-63 (ST-24): Staff-assisted Beneficiary account linking and creation at the counter.
 *
 * Nhóm DTO cho việc liên kết/tạo tài khoản người thụ hưởng tại quầy, dùng bởi {@code StaffBeneficiaryAccountController}
 * và {@code BeneficiaryAccountService}. Hai endpoint này mặc định bị tắt (HTTP 410).
 */
public final class BeneficiaryAccountDtos {

	/**
	 * Lớp tiện ích chỉ chứa record lồng nhau, không cho khởi tạo.
	 */
	private BeneficiaryAccountDtos() { }

	/**
	 * Link an existing official account, identified by its login email.
	 *
	 * Body của {@code POST /api/v1/staff/beneficiaries/{beneficiaryId}/account-link}.
	 * <ul>
	 * <li>{@code accountEmail}: email đăng nhập của tài khoản đã tồn tại cần liên kết (bắt buộc, đúng định dạng, tối đa 254 ký tự).</li>
	 * </ul>
	 */
	public record LinkRequest(
			@NotBlank(message = "validation.NotBlank")
			@Email(message = "validation.Email")
			@Size(max = 254, message = "validation.Size") String accountEmail) { }

	/**
	 * Create the account at the counter. The password is chosen by the Beneficiary and is never stored in clear.
	 *
	 * Body của {@code POST /api/v1/staff/beneficiaries/{beneficiaryId}/account}.
	 * <ul>
	 * <li>{@code email}: email của tài khoản mới (bắt buộc, tối đa 254 ký tự).</li>
	 * <li>{@code password}: mật khẩu do người thụ hưởng tự chọn, 8-72 ký tự; chỉ lưu dạng băm.</li>
	 * <li>{@code phone}: số điện thoại tùy chọn, rỗng hoặc 8-15 chữ số (có thể có dấu cộng đứng đầu).</li>
	 * </ul>
	 */
	public record CreateRequest(
			@NotBlank(message = "validation.NotBlank")
			@Email(message = "validation.Email")
			@Size(max = 254, message = "validation.Size") String email,
			@NotBlank(message = "validation.NotBlank")
			@Size(min = 8, max = 72, message = "validation.Size") String password,
			@Pattern(regexp = "^$|^\\+?[0-9]{8,15}$", message = "validation.Pattern") String phone) {
		/**
		 * Keep the secret out of any accidental toString/log output.
		 *
		 * Ghi đè {@code toString} để che mật khẩu, tránh lộ bí mật qua log.
		 */
		@Override
		public String toString() {
			return "CreateRequest[email=" + email + ", password=<redacted>, phone=" + phone + "]";
		}
	}

	/**
	 * Kết quả trả về sau khi liên kết/tạo tài khoản.
	 * <ul>
	 * <li>{@code beneficiaryId}: mã công khai của người thụ hưởng.</li>
	 * <li>{@code accountId}: mã công khai của tài khoản đã liên kết.</li>
	 * <li>{@code accountStatus}: trạng thái tài khoản của hồ sơ (ví dụ {@code ACCOUNT_CREATED}).</li>
	 * <li>{@code identityVerificationStatus}: trạng thái xác minh danh tính (ví dụ {@code VERIFIED_AT_COUNTER}).</li>
	 * </ul>
	 */
	public record Response(UUID beneficiaryId, UUID accountId, String accountStatus,
			String identityVerificationStatus) {
		/**
		 * Dựng {@code Response} từ thực thể người thụ hưởng và mã công khai của tài khoản.
		 */
		static Response from(Beneficiary beneficiary, UUID accountPublicId) {
			return new Response(beneficiary.getPublicId(), accountPublicId, beneficiary.getAccountStatus(),
					beneficiary.getIdentityVerificationStatus());
		}
	}
}
