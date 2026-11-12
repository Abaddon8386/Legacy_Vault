package com.legacyvault.trustee;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

/** Staff-only read of the contact details of the Trustee and Beneficiaries of an assigned OPEN case; every read is audited. */
@Service
public class CaseContactService {

	static final String APPOINTED = "APPOINTED";

	private final VerificationCaseRepository cases;
	private final StaffVaultCaseGuard guard;
	private final TrusteeRepository trustees;
	private final BeneficiaryRepository beneficiaries;
	private final TrusteeContactRecordRepository records;
	private final StaffContextService staff;
	private final AuditService audit;

	public CaseContactService(VerificationCaseRepository cases, StaffVaultCaseGuard guard, TrusteeRepository trustees,
			BeneficiaryRepository beneficiaries, TrusteeContactRecordRepository records, StaffContextService staff,
			AuditService audit) {
		this.cases = cases;
		this.guard = guard;
		this.trustees = trustees;
		this.beneficiaries = beneficiaries;
		this.records = records;
		this.staff = staff;
		this.audit = audit;
	}

	@Transactional
	public CaseContactDtos.Response list(UUID caseId) {
		User actor = staff.requireStaff();
		VerificationCase verificationCase = cases.findByPublicIdAndAssignedStaffUserId(caseId, actor.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		Long vaultId = verificationCase.getVaultId();
		// Same predicate as every Staff write: an OPEN case of this Vault assigned to this Staff.
		guard.requireOpenForRead(vaultId, actor.getUserId());

		List<CaseContactDtos.Person> people = new ArrayList<>();
		for (Trustee trustee : trustees.findAllByVault_VaultIdAndStatusOrderByIdAsc(vaultId, APPOINTED)) {
			List<TrusteeContactDtos.RecordResponse> history = records
					.findAllByTrustee_PublicIdOrderByOccurredAtDesc(trustee.getPublicId()).stream()
					.map(TrusteeContactDtos.RecordResponse::from).toList();
			people.add(new CaseContactDtos.Person(CaseContactDtos.TRUSTEE, trustee.getPublicId(), trustee.getFullName(),
					trustee.getRelationship(), trustee.getPhone(), trustee.getEmail(), true, history));
		}
		for (Beneficiary beneficiary : beneficiaries.findAllByVault_VaultIdOrderByIdAsc(vaultId)) {
			people.add(new CaseContactDtos.Person(CaseContactDtos.BENEFICIARY, beneficiary.getPublicId(),
					beneficiary.getFullName(), beneficiary.getRelationship(), beneficiary.getPhone(),
					beneficiary.getEmail(), false, List.of()));
		}
		audit.record(actor.getUserId(), vaultId, "CASE_CONTACTS_VIEWED", "VERIFICATION_CASE",
				verificationCase.getVerificationCaseId(), "USER",
				Map.of("people", people.size(), "stepId", "ST-10", "ruleId", "LV-EXT-001"));
		return new CaseContactDtos.Response(caseId, people);
	}
}
