package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

/**
 * PS-88 (ST-14, ST-24): read-only view of the Beneficiaries of a case for the Staff serving them at the counter.
 * Only the Staff assigned to an OPEN case sees anything; any other case, a closed case or an unknown id is 404. The
 * view never lists data of another Vault and never exposes contact data, identity numbers or invitation secrets.
 */
@Service
public class CounterBeneficiaryService {

	private final VerificationCaseRepository cases;
	private final StaffVaultCaseGuard guard;
	private final BeneficiaryRepository beneficiaries;
	private final BeneficiaryInvitationRepository invitations;
	private final StaffContextService staff;

	public CounterBeneficiaryService(VerificationCaseRepository cases, StaffVaultCaseGuard guard,
			BeneficiaryRepository beneficiaries, BeneficiaryInvitationRepository invitations, StaffContextService staff) {
		this.cases = cases;
		this.guard = guard;
		this.beneficiaries = beneficiaries;
		this.invitations = invitations;
		this.staff = staff;
	}

	@Transactional(readOnly = true)
	public List<CounterBeneficiaryDtos.Item> list(UUID caseId) {
		VerificationCase verificationCase = authorize(caseId);
		Long vaultId = verificationCase.getVaultId();
		Map<Long, BeneficiaryInvitation> current = invitations.findAllByBeneficiary_Vault_VaultIdAndCurrentTrue(vaultId)
				.stream().collect(Collectors.toMap(i -> i.getBeneficiary().getId(), Function.identity(), (a, b) -> a));
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		return beneficiaries.findAllByVault_VaultIdOrderByIdAsc(vaultId).stream()
				.map(b -> CounterBeneficiaryDtos.Item.from(b, caseId, current.get(b.getId()), now)).toList();
	}

	@Transactional(readOnly = true)
	public CounterBeneficiaryDtos.Item get(UUID caseId, UUID beneficiaryId) {
		VerificationCase verificationCase = authorize(caseId);
		Beneficiary beneficiary = beneficiaries.findByPublicIdAndVault_VaultId(beneficiaryId, verificationCase.getVaultId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		BeneficiaryInvitation invitation = invitations.findByBeneficiary_IdAndCurrentTrue(beneficiary.getId()).orElse(null);
		return CounterBeneficiaryDtos.Item.from(beneficiary, caseId, invitation, LocalDateTime.now(ZoneOffset.UTC));
	}

	private VerificationCase authorize(UUID caseId) {
		User actor = staff.requireStaff();
		VerificationCase verificationCase = cases.findByPublicIdAndAssignedStaffUserId(caseId, actor.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		// Same predicate as every Staff write: an OPEN case of this Vault assigned to this Staff.
		guard.requireOpenForRead(verificationCase.getVaultId(), actor.getUserId());
		return verificationCase;
	}
}
