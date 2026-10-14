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
import com.legacyvault.user.UserAccount;

@Service
public class TrusteeContactService {

	private final TrusteeRepository trustees;
	private final TrusteeContactRecordRepository records;
	private final StaffContextService staff;
	private final AuditService audit;

	public TrusteeContactService(TrusteeRepository trustees, TrusteeContactRecordRepository records,
			StaffContextService staff, AuditService audit) {
		this.trustees = trustees;
		this.records = records;
		this.staff = staff;
		this.audit = audit;
	}

	@Transactional
	public TrusteeContactDtos.RecordResponse record(UUID trusteeId, TrusteeContactDtos.RecordRequest request) {
		UserAccount actor = staff.requireStaff();
		Trustee trustee = trustees.findByPublicId(trusteeId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		String note = clean(request.note());
		TrusteeContactRecord record = records.saveAndFlush(new TrusteeContactRecord(trustee, actor.getId(),
				request.channel().name(), request.outcome().name(), request.fallbackStatus().name(), note));
		audit.record(actor.getId(), trustee.getVault().getId(), "TRUSTEE_CONTACT_RECORDED", "TRUSTEE_CONTACT",
				record.getId(), "STAFF", Map.of("channel", request.channel().name(), "outcome", request.outcome().name(),
						"fallbackStatus", request.fallbackStatus().name(), "stepId", "ST-10", "ruleId", "LV-EXT-001"));
		return TrusteeContactDtos.RecordResponse.from(record);
	}

	@Transactional(readOnly = true)
	public List<TrusteeContactDtos.RecordResponse> history(UUID trusteeId) {
		staff.requireStaff();
		if (!trustees.existsByPublicId(trusteeId)) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
		return records.findAllByTrustee_PublicIdOrderByOccurredAtDesc(trusteeId).stream()
				.map(TrusteeContactDtos.RecordResponse::from).toList();
	}

	private String clean(String value) {
		if (value == null) return null;
		String cleaned = value.trim();
		return cleaned.isEmpty() ? null : cleaned;
	}
}
