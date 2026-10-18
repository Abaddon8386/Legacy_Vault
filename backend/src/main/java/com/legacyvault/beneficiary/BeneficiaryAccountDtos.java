package com.legacyvault.beneficiary;

import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** PS-62/PS-63 (ST-24): Staff-assisted Beneficiary account linking and creation at the counter. */
public final class BeneficiaryAccountDtos {

	private BeneficiaryAccountDtos() { }

	/** Link an existing official account, identified by its login email. */
	public record LinkRequest(
			@NotBlank(message = "validation.NotBlank")
			@Email(message = "validation.Email")
			@Size(max = 254, message = "validation.Size") String accountEmail) { }

	/** Create the account at the counter. The password is chosen by the Beneficiary and is never stored in clear. */
	public record CreateRequest(
			@NotBlank(message = "validation.NotBlank")
			@Email(message = "validation.Email")
			@Size(max = 254, message = "validation.Size") String email,
			@NotBlank(message = "validation.NotBlank")
			@Size(min = 8, max = 72, message = "validation.Size") String password,
			@Pattern(regexp = "^$|^\\+?[0-9]{8,15}$", message = "validation.Pattern") String phone) {
		/** Keep the secret out of any accidental toString/log output. */
		@Override
		public String toString() {
			return "CreateRequest[email=" + email + ", password=<redacted>, phone=" + phone + "]";
		}
	}

	public record Response(UUID beneficiaryId, UUID accountId, String accountStatus,
			String identityVerificationStatus) {
		static Response from(Beneficiary beneficiary, UUID accountPublicId) {
			return new Response(beneficiary.getPublicId(), accountPublicId, beneficiary.getAccountStatus(),
					beneficiary.getIdentityVerificationStatus());
		}
	}
}
