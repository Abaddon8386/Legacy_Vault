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

/**
 * Staff đọc thông tin liên hệ của Trustee và Beneficiary trên hồ sơ OPEN được giao; mỗi lần đọc đều được audit
 * ({@code CASE_CONTACTS_VIEWED}). Được {@code CaseContactController} gọi; dùng bảng {@code verification_cases}, {@code trustees},
 * {@code beneficiaries}, {@code trustee_contact_records}.
 */
@Service
public class CaseContactService {

	/**
	 * Trạng thái Trustee đang có hiệu lực.
	 */
	static final String APPOINTED = "APPOINTED";

	/**
	 * Truy vấn hồ sơ xác minh.
	 */
	private final VerificationCaseRepository cases;
	/**
	 * Kiểm tra hồ sơ OPEN của Vault được giao cho Staff.
	 */
	private final StaffVaultCaseGuard guard;
	/**
	 * Truy vấn Trustee.
	 */
	private final TrusteeRepository trustees;
	/**
	 * Truy vấn Beneficiary.
	 */
	private final BeneficiaryRepository beneficiaries;
	/**
	 * Lịch sử liên hệ Trustee.
	 */
	private final TrusteeContactRecordRepository records;
	/**
	 * Lấy Staff đang đăng nhập.
	 */
	private final StaffContextService staff;
	/**
	 * Ghi audit.
	 */
	private final AuditService audit;

	/**
	 * Khởi tạo service với các phụ thuộc do Spring inject.
	 */
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

	/**
	 * Liệt kê người cần liên lạc ({@code GET /api/v1/staff/verification-cases/{caseId}/contacts}).
	 *
	 * Các bước: lấy Staff -> tìm hồ sơ do Staff này phụ trách -> {@code guard.requireOpenForRead} (cùng điều kiện với mọi thao tác ghi của Staff) ->
	 * đọc Trustee APPOINTED kèm lịch sử liên hệ (canRecord=true) và Beneficiary của Vault (canRecord=false) -> audit {@code CASE_CONTACTS_VIEWED}
	 * (bước ST-10, rule LV-EXT-001).
	 *
	 * @param caseId public id hồ sơ
	 * @return {@link CaseContactDtos.Response}
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND nếu hồ sơ không thuộc Staff; lỗi từ guard nếu hồ sơ không OPEN
	 */
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
