package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * PS-88 (ST-14, ST-24, LV-ID-001): what Staff may read about the Beneficiaries of a case they own while serving them at
 * the counter. Public ids only; no email, phone, identity document data or invitation secret.
 *
 * Nhóm DTO chỉ đọc cho Staff xem người thụ hưởng của một case tại quầy; dùng bởi {@code CounterBeneficiaryService} và {@code StaffCaseBeneficiaryController}.
 * Không chứa email, số điện thoại, số giấy tờ hay mã mời.
 */
public final class CounterBeneficiaryDtos {

	/**
	 * Lớp tiện ích, không cho khởi tạo.
	 */
	private CounterBeneficiaryDtos() { }

	/**
	 * Bước tại quầy: chờ xác minh danh tính.
	 */
	public static final String STEP_AWAITING_IDENTITY = "AWAITING_IDENTITY_VERIFICATION";
	/**
	 * Bước tại quầy: đã xác minh, chờ quyết định về tài khoản.
	 */
	public static final String STEP_AWAITING_ACCOUNT_DECISION = "AWAITING_ACCOUNT_DECISION";
	/**
	 * Bước tại quầy: đã liên kết tài khoản.
	 */
	public static final String STEP_ACCOUNT_LINKED = "ACCOUNT_LINKED";

	/**
	 * Tóm tắt mã mời hiện hành: {@code state} là NOT_ISSUED, PENDING, EXPIRED, REVOKED hoặc CONSUMED; {@code expiresAt} hạn của mã (null nếu chưa cấp);
	 * {@code generation} bằng 0 khi chưa cấp mã, và là giá trị {@code expectedGeneration} mà yêu cầu gửi email mời của Staff phải gửi lại.
	 */
	public record InvitationSummary(String state, Instant expiresAt, int generation) { }

	/**
	 * Tóm tắt chứng thực Staff đã ghi tại quầy ({@code BeneficiaryCounterAttestation}): chỉ cho biết có hay chưa ({@code recorded}), thời điểm
	 * ({@code recordedAt}) và đã xác nhận email hay chưa ({@code confirmedEmailRecorded}); không bao giờ trả mã tham chiếu bằng chứng hay email.
	 * Đây là bản ghi trách nhiệm của Staff, không phải kết quả xác minh danh tính tự động.
	 */
	public record CounterAttestationSummary(boolean recorded, Instant recordedAt, boolean confirmedEmailRecorded) { }

	/**
	 * Gợi ý cho UI: {@code canLinkAccount} (liên kết tài khoản có sẵn), {@code canCreateAccount} (tạo tài khoản), {@code canHandOverWithoutAccount}
	 * (bàn giao không cần tài khoản, chỉ cần đã xác minh tại quầy) và {@code canRequestInvitationEmail} (xếp email mời; cần đã xác minh, chưa
	 * liên kết, đã có email xác nhận và mã hiện hành chưa dùng/chưa gắn email). Server kiểm tra lại mọi điều kiện khi thực hiện hành động,
	 * nên giá trị false nên ẩn hành động còn giá trị true không thay thế quyết định của server.
	 */
	public record Actions(boolean canLinkAccount, boolean canCreateAccount, boolean canHandOverWithoutAccount,
			boolean canRequestInvitationEmail) { }

	/**
	 * Một người thụ hưởng trong góc nhìn của Staff, trả về bởi {@code GET /api/v1/staff/verification-cases/{caseId}/beneficiaries[/{beneficiaryId}]}.
	 * <ul>
	 * <li>{@code beneficiaryId}, {@code caseId}: mã công khai.</li>
	 * <li>{@code fullName}, {@code relationship}: thông tin hiển thị.</li>
	 * <li>{@code identityVerificationStatus}, {@code accountStatus}, {@code accountLinked}: trạng thái xác minh và liên kết.</li>
	 * <li>{@code invitation}: tóm tắt mã mời; {@code counterAttestation}: tóm tắt chứng thực tại quầy.</li>
	 * <li>{@code counterStep}: bước hiện tại (hằng số {@code STEP_*}); {@code actions}: gợi ý hành động cho UI.</li>
	 * </ul>
	 */
	public record Item(UUID beneficiaryId, UUID caseId, String fullName, String relationship,
			String identityVerificationStatus, String accountStatus, boolean accountLinked,
			InvitationSummary invitation, CounterAttestationSummary counterAttestation, String counterStep,
			Actions actions) {

		/**
		 * Dựng {@code Item} từ thực thể: tính bước {@code counterStep}, tóm tắt mã mời (NOT_ISSUED nếu chưa có), tóm tắt chứng thực
		 * và các cờ hành động (chỉ mang tính gợi ý, server vẫn kiểm tra lại).
		 */
		static Item from(Beneficiary beneficiary, UUID caseId, BeneficiaryInvitation invitation,
				BeneficiaryCounterAttestation attestation, LocalDateTime now) {
			boolean verified = Beneficiary.VERIFIED_AT_COUNTER.equals(beneficiary.getIdentityVerificationStatus());
			boolean linked = beneficiary.hasAccount();
			String step = !verified ? STEP_AWAITING_IDENTITY : linked ? STEP_ACCOUNT_LINKED : STEP_AWAITING_ACCOUNT_DECISION;
			InvitationSummary summary = invitation == null ? new InvitationSummary("NOT_ISSUED", null, 0)
					: new InvitationSummary(invitation.state(now), invitation.getExpiresAt().toInstant(ZoneOffset.UTC),
							invitation.getGeneration());
			boolean confirmedEmail = attestation != null && attestation.getConfirmedEmail() != null
					&& !attestation.getConfirmedEmail().isBlank();
			CounterAttestationSummary attested = attestation == null ? new CounterAttestationSummary(false, null, false)
					: new CounterAttestationSummary(true, attestation.getAttestedAt().toInstant(ZoneOffset.UTC), confirmedEmail);
			// Mirrors only the cheap server preconditions; Legal approval/unlock and allocation scope are re-checked at request time.
			boolean mailable = invitation == null
					|| (invitation.getConsumedAt() == null && invitation.getRecipientEmail() == null);
			// An account is optional: the handover only needs the in-person identity check (D-API-38).
			Actions actions = new Actions(verified && !linked, verified && !linked, verified,
					verified && !linked && confirmedEmail && mailable);
			return new Item(beneficiary.getPublicId(), caseId, beneficiary.getFullName(), beneficiary.getRelationship(),
					beneficiary.getIdentityVerificationStatus(), beneficiary.getAccountStatus(), linked, summary, attested,
					step, actions);
		}
	}
}
