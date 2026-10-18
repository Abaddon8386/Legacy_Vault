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
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;
import jakarta.persistence.EntityManager;

@Service
public class IdentityVerificationService {

	private final BeneficiaryRepository beneficiaries;
	private final IdentityVerificationRepository verifications;
	private final StaffContextService staff;
	private final UserRepository users;
	private final AuditService audit;
	private final StaffVaultCaseGuard cases;
	private final EntityManager entities;

	public IdentityVerificationService(BeneficiaryRepository beneficiaries,
			IdentityVerificationRepository verifications, StaffContextService staff,
			UserRepository users, AuditService audit, StaffVaultCaseGuard cases, EntityManager entities) {
		this.beneficiaries = beneficiaries;
		this.verifications = verifications;
		this.staff = staff;
		this.users = users;
		this.audit = audit;
		this.cases = cases;
		this.entities = entities;
	}

	@Transactional
	public IdentityVerificationDtos.Response verify(UUID beneficiaryId, IdentityVerificationDtos.Request request) {
		User actor = staff.requireStaff();
		Beneficiary beneficiary = beneficiaries.findByPublicId(beneficiaryId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		Long vaultId = beneficiary.getVault().getVaultId();
		cases.requireOpenForWrite(vaultId, actor.getUserId());
		// A waiting transaction may have loaded the old state before another verifier committed.
		// Refresh under the Vault/Case locks before modifying the managed entity.
		entities.refresh(beneficiary);
		if (!vaultId.equals(beneficiary.getVault().getVaultId())) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
		String authority = clean(request.issuingAuthority());
		IdentityVerificationRecord record = verifications.saveAndFlush(new IdentityVerificationRecord(beneficiary,
				actor.getUserId(), request.documentType().name(), authority, clean(request.documentSuffix()),
				request.result().name()));
		switch (request.result()) {
			case MATCH -> beneficiary.verifyAtCounter();
			case NOT_MATCH -> beneficiary.markIdentityNotVerified();
		}
		beneficiaries.save(beneficiary);
		audit.record(actor.getUserId(), beneficiary.getVault().getVaultId(), "BENEFICIARY_IDENTITY_VERIFIED", "BENEFICIARY",
				beneficiary.getId(), "USER", Map.of("result", request.result().name(), "documentType",
						request.documentType().name(), "stepId", "ST-14", "ruleId", "LV-ID-001"));
		return IdentityVerificationDtos.Response.from(record, actor);
	}

	@Transactional(readOnly = true)
	public List<IdentityVerificationDtos.Response> history(UUID beneficiaryId) {
		User actor = staff.requireStaff();
		Beneficiary beneficiary = beneficiaries.findByPublicId(beneficiaryId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		cases.requireOpenForRead(beneficiary.getVault().getVaultId(), actor.getUserId());
		List<IdentityVerificationRecord> history = verifications
				.findAllByBeneficiary_PublicIdOrderByVerifiedAtDesc(beneficiaryId);
		Map<Long, User> actors = users.findAllById(history.stream()
				.map(IdentityVerificationRecord::getActorUserId).distinct().toList()).stream()
				.collect(Collectors.toMap(User::getUserId, Function.identity()));
		return history.stream().map(record -> {
			User verifier = actors.get(record.getActorUserId());
			if (verifier == null) {
				throw new IllegalStateException("Verification actor is missing");
			}
			return IdentityVerificationDtos.Response.from(record, verifier);
		}).toList();
	}

	private String clean(String value) {
		if (value == null) return null;
		String cleaned = value.trim();
		return cleaned.isEmpty() ? null : cleaned;
	}
}
