package com.legacyvault.beneficiary;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * PS-88 (ST-14, ST-24, LV-ID-001): what Staff may read about the Beneficiaries of a case they own while serving them at
 * the counter. Public ids only; no email, phone, identity document data or invitation secret.
 */
public final class CounterBeneficiaryDtos {

	private CounterBeneficiaryDtos() { }

	public static final String STEP_AWAITING_IDENTITY = "AWAITING_IDENTITY_VERIFICATION";
	public static final String STEP_AWAITING_ACCOUNT_DECISION = "AWAITING_ACCOUNT_DECISION";
	public static final String STEP_ACCOUNT_LINKED = "ACCOUNT_LINKED";

	/** State of the current invitation: NOT_ISSUED, PENDING, EXPIRED, REVOKED or CONSUMED. */
	public record InvitationSummary(String state, Instant expiresAt) { }

	/**
	 * Hints for the UI only. The server re-checks every precondition when the action is requested, so a false value must
	 * hide the action while a true value never replaces the server decision.
	 */
	public record Actions(boolean canLinkAccount, boolean canCreateAccount, boolean canHandOverWithoutAccount) { }

	public record Item(UUID beneficiaryId, UUID caseId, String fullName, String relationship,
			String identityVerificationStatus, String accountStatus, boolean accountLinked,
			InvitationSummary invitation, String counterStep, Actions actions) {

		static Item from(Beneficiary beneficiary, UUID caseId, BeneficiaryInvitation invitation, LocalDateTime now) {
			boolean verified = Beneficiary.VERIFIED_AT_COUNTER.equals(beneficiary.getIdentityVerificationStatus());
			boolean linked = beneficiary.hasAccount();
			String step = !verified ? STEP_AWAITING_IDENTITY : linked ? STEP_ACCOUNT_LINKED : STEP_AWAITING_ACCOUNT_DECISION;
			InvitationSummary summary = invitation == null ? new InvitationSummary("NOT_ISSUED", null)
					: new InvitationSummary(invitation.state(now), invitation.getExpiresAt().toInstant(ZoneOffset.UTC));
			// An account is optional: the handover only needs the in-person identity check (D-API-38).
			Actions actions = new Actions(verified && !linked, verified && !linked, verified);
			return new Item(beneficiary.getPublicId(), caseId, beneficiary.getFullName(), beneficiary.getRelationship(),
					beneficiary.getIdentityVerificationStatus(), beneficiary.getAccountStatus(), linked, summary, step,
					actions);
		}
	}
}
