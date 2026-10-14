package com.legacyvault.beneficiary;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.UserAccount;
import com.legacyvault.user.UserAccountRepository;

@Service
public class IdentityVerificationService {

	private final BeneficiaryRepository beneficiaries;
	private final IdentityVerificationRepository verifications;
	private final StaffContextService staff;
	private final UserAccountRepository users;
	private final AuditService audit;

	public IdentityVerificationService(BeneficiaryRepository beneficiaries,
			IdentityVerificationRepository verifications, StaffContextService staff,
			UserAccountRepository users, AuditService audit) {
		this.beneficiaries = beneficiaries;
		this.verifications = verifications;
		this.staff = staff;
		this.users = users;
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
		return IdentityVerificationDtos.Response.from(record, actor);
	}

	@Transactional(readOnly = true)
	public List<IdentityVerificationDtos.Response> history(UUID beneficiaryId) {
		staff.requireStaff();
		if (!beneficiaries.existsByPublicId(beneficiaryId)) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
		List<IdentityVerificationRecord> history = verifications
				.findAllByBeneficiary_PublicIdOrderByVerifiedAtDesc(beneficiaryId);
		Map<Long, UserAccount> actors = users.findAllById(history.stream()
				.map(IdentityVerificationRecord::getActorUserId).distinct().toList()).stream()
				.collect(Collectors.toMap(UserAccount::getId, Function.identity()));
		return history.stream().map(record -> {
			UserAccount actor = actors.get(record.getActorUserId());
			if (actor == null) {
				throw new IllegalStateException("Verification actor is missing");
			}
			return IdentityVerificationDtos.Response.from(record, actor);
		}).toList();
	}

	private String clean(String value) {
		if (value == null) return null;
		String cleaned = value.trim();
		return cleaned.isEmpty() ? null : cleaned;
	}
}
