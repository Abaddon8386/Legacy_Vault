package com.legacyvault.common.error;

/**
 * Danh mục mã lỗi công khai. {@code name()} là giá trị "code" trong JSON lỗi và là thứ duy nhất
 * FE được phép dùng để phân loại lỗi (không so sánh chuỗi message).
 *
 * <p>Thêm mã mới: thêm một dòng ở đây, thêm message key vi/en vào messages*.properties và cập nhật
 * docs/api-contracts/error-contract.md trong cùng PR.
 */
public enum ErrorCode {
	VALIDATION_FAILED(400, "error.validation.failed"),
	MALFORMED_REQUEST(400, "error.request.malformed"),
	UNAUTHENTICATED(401, "error.auth.unauthenticated"),
	INVALID_CREDENTIALS(401, "error.auth.invalidCredentials"),
	ACCESS_DENIED(403, "error.auth.accessDenied"),
	REAUTH_FAILED(403, "error.auth.reauthFailed"),
	RESOURCE_NOT_FOUND(404, "error.resource.notFound"),
	METHOD_NOT_ALLOWED(405, "error.request.methodNotAllowed"),
	EMAIL_ALREADY_EXISTS(409, "error.auth.emailExists"),
	VAULT_ALREADY_EXISTS(409, "error.vault.alreadyExists"),
	TRUSTEE_ALREADY_EXISTS(409, "error.trustee.alreadyExists"),
	TRUSTEE_REVOKED(409, "error.trustee.revoked"),
	VAULT_NOT_EDITABLE(409, "error.vault.notEditable"),
	ALERT_NOT_CANCELLABLE(409, "error.vault.alertNotCancellable"),
	DMS_NOT_MONITORING(409, "error.dms.notMonitoring"),
	VERIFICATION_CASE_NOT_CLAIMABLE(409, "error.verificationCase.notClaimable"),
	VERIFICATION_CASE_NOT_OPEN(409, "error.verificationCase.notOpen"),
	HANDOVER_SESSION_ALREADY_OPEN(409, "error.handoverSession.alreadyOpen"),
	HANDOVER_SESSION_INVALID_STATE(409, "error.handoverSession.invalidState"),
	HANDOVER_RECEIPT_INVALID_STATE(409, "error.handoverReceipt.invalidState"),
	HANDOVER_RECEIPT_ASSET_NOT_ALLOCATED(409, "error.handoverReceipt.assetNotAllocated"),
	HANDOVER_RECEIPT_RECIPIENT_NOT_VERIFIED(409, "error.handoverReceipt.recipientNotVerified"),
	HANDOVER_RECEIPT_REISSUE_INVALID(409, "error.handoverReceipt.reissueInvalid"),
	WILL_NOT_VERIFIED(409, "error.legalBasis.willNotVerified"),
	BASIS_DOSSIER_ALREADY_EXISTS(409, "error.legalBasis.dossierExists"),
	BASIS_DOSSIER_INVALID_STATE(409, "error.legalBasis.invalidState"),
	BASIS_VERSION_STALE(409, "error.legalBasis.versionStale"),
	LEGAL_DECISION_STALE(409, "error.legalApproval.snapshotStale"),
	LEGAL_APPROVAL_REQUIRED(409, "error.legalApproval.required"),
	COURT_EVIDENCE_REQUIRED(409, "error.legalBasis.courtEvidenceRequired"),
	COURT_DECISION_REQUIRED(409, "error.legalBasis.courtDecisionRequired"),
	LEGAL_WORKFLOW_ON_HOLD(409, "error.legalBasis.onHold"),
	LEGAL_VERIFICATION_INVALID_STATE(409, "error.legalVerification.invalidState"),
	LEGAL_VERIFICATION_ALREADY_DECIDED(409, "error.legalVerification.alreadyDecided"),
	BENEFICIARY_REQUIRED(422, "error.beneficiary.required"),
	PAYLOAD_TOO_LARGE(413, "error.request.payloadTooLarge"),
	SUBSCRIPTION_POLICY_PENDING(409, "error.subscription.policyPending"),
	SUBSCRIPTION_UPGRADE_UNAVAILABLE(409, "error.subscription.upgradeUnavailable"),
	SUBSCRIPTION_CATALOG_STALE(409, "error.subscription.catalogStale"),
	SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED(409, "error.subscription.downgradeNotAllowed"),
	CASE_EVIDENCE_QUOTA_EXCEEDED(409, "error.subscription.caseEvidenceQuotaExceeded"),
	ASSET_QUOTA_EXCEEDED(409, "error.subscription.assetQuotaExceeded"),
	STORAGE_QUOTA_EXCEEDED(409, "error.subscription.storageQuotaExceeded"),
	UNSUPPORTED_MEDIA_TYPE(415, "error.request.unsupportedMediaType"),
	TOO_MANY_ATTEMPTS(429, "error.auth.tooManyAttempts"),
	INTERNAL_ERROR(500, "error.internal");

	private final int status;
	private final String messageKey;

	ErrorCode(int status, String messageKey) {
		this.status = status;
		this.messageKey = messageKey;
	}

	public int status() {
		return status;
	}
	public String messageKey() {
		return messageKey;
	}
}
