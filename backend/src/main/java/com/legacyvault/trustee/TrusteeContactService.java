package com.legacyvault.trustee;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

@Service
public class TrusteeContactService {

	private final TrusteeRepository trustees;
	private final TrusteeContactRecordRepository records;
	private final StaffContextService staff;
	private final AuditService audit;
	private final StaffVaultCaseGuard cases;

	public TrusteeContactService(TrusteeRepository trustees, TrusteeContactRecordRepository records,
			StaffContextService staff, AuditService audit, StaffVaultCaseGuard cases) {
		this.trustees = trustees;
		this.records = records;
		this.staff = staff;
		this.audit = audit;
		this.cases = cases;
	}

	@Transactional
	public TrusteeContactDtos.RecordResponse record(UUID trusteeId, TrusteeContactDtos.RecordRequest request) {
		User actor = staff.requireStaff();
		Trustee trustee = trustees.findByPublicId(trusteeId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		// Trustee's vault relationship cannot be changed through the domain/API.
		cases.requireOpenForWrite(trustee.getVault().getVaultId(), actor.getUserId());
		String note = clean(request.note());
		TrusteeContactRecord record = records.saveAndFlush(new TrusteeContactRecord(trustee, actor.getUserId(),
				request.channel().name(), request.outcome().name(), request.fallbackStatus().name(), note));
		audit.record(actor.getUserId(), trustee.getVault().getVaultId(), "TRUSTEE_CONTACT_RECORDED", "TRUSTEE_CONTACT",
				record.getId(), "USER", Map.of("channel", request.channel().name(), "outcome", request.outcome().name(),
						"fallbackStatus", request.fallbackStatus().name(), "stepId", "ST-10", "ruleId", "LV-EXT-001"));
		return TrusteeContactDtos.RecordResponse.from(record);
	}

	@Transactional(readOnly = true)
	public List<TrusteeContactDtos.RecordResponse> history(UUID trusteeId) {
		User actor = staff.requireStaff();
		Trustee trustee = trustees.findByPublicId(trusteeId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		cases.requireOpenForRead(trustee.getVault().getVaultId(), actor.getUserId());
		return records.findAllByTrustee_PublicIdOrderByOccurredAtDesc(trusteeId).stream()
				.map(TrusteeContactDtos.RecordResponse::from).toList();
	}

	private String clean(String value) {
		if (value == null) return null;
		String cleaned = value.trim();
		return cleaned.isEmpty() ? null : cleaned;
	}
}
