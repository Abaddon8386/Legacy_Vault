package com.legacyvault.beneficiary;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.UserAccount;

@Service
public class IdentityVerificationService {

	private final BeneficiaryRepository beneficiaries;
	private final IdentityVerificationRepository verifications;
	private final StaffContextService staff;
	private final AuditService audit;

	public IdentityVerificationService(BeneficiaryRepository beneficiaries,
			IdentityVerificationRepository verifications, StaffContextService staff, AuditService audit) {
		this.beneficiaries = beneficiaries;
		this.verifications = verifications;
		this.staff = staff;
		this.audit = audit;
	}

	@Transactional
	public IdentityVerificationDtos.Response verify(UUID beneficiaryId, IdentityVerificationDtos.Request request) {
		UserAccount actor = staff.requireStaff();
		Beneficiary beneficiary = beneficiaries.findByPublicId(beneficiaryId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		String authority = clean(request.issuingAuthority());
		IdentityVerificationRecord record = verifications.saveAndFlush(new IdentityVerificationRecord(beneficiary,
				actor.getId(), request.documentType().name(), authority, clean(request.documentSuffix()),
				request.result().name()));
		beneficiary.recordIdentityVerification(request.result().name());
		beneficiaries.save(beneficiary);
		audit.record(actor.getId(), beneficiary.getVault().getId(), "BENEFICIARY_IDENTITY_VERIFIED", "BENEFICIARY",
				beneficiary.getId(), "STAFF", Map.of("result", request.result().name(), "documentType",
						request.documentType().name(), "stepId", "ST-14", "ruleId", "LV-ID-001"));
		return IdentityVerificationDtos.Response.from(record);
	}

	@Transactional(readOnly = true)
	public List<IdentityVerificationDtos.Response> history(UUID beneficiaryId) {
		staff.requireStaff();
		if (!beneficiaries.existsByPublicId(beneficiaryId)) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
		return verifications.findAllByBeneficiary_PublicIdOrderByVerifiedAtDesc(beneficiaryId).stream()
				.map(IdentityVerificationDtos.Response::from).toList();
	}

	private String clean(String value) {
		if (value == null) return null;
		String cleaned = value.trim();
		return cleaned.isEmpty() ? null : cleaned;
	}
}
