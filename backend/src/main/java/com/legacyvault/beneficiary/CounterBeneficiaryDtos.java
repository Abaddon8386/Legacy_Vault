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

	/**
	 * State of the current invitation: NOT_ISSUED, PENDING, EXPIRED, REVOKED or CONSUMED. {@code generation} is 0 when
	 * nothing was issued; it is the {@code expectedGeneration} the Staff invitation-email request must echo back.
	 */
	public record InvitationSummary(String state, Instant expiresAt, int generation) { }

	/**
	 * What Staff recorded at the counter (CounterIdentityAttestation): only whether it exists, when, and whether an email
	 * was confirmed. Never the evidence reference or the email itself. This is a Staff responsibility record, not an
	 * automatic identity verification.
	 */
	public record CounterAttestationSummary(boolean recorded, Instant recordedAt, boolean confirmedEmailRecorded) { }

	/**
	 * Hints for the UI only. The server re-checks every precondition when the action is requested, so a false value must
	 * hide the action while a true value never replaces the server decision.
	 */
	public record Actions(boolean canLinkAccount, boolean canCreateAccount, boolean canHandOverWithoutAccount,
			boolean canRequestInvitationEmail) { }

	public record Item(UUID beneficiaryId, UUID caseId, String fullName, String relationship,
			String identityVerificationStatus, String accountStatus, boolean accountLinked,
			InvitationSummary invitation, CounterAttestationSummary counterAttestation, String counterStep,
			Actions actions) {

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
