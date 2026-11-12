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
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

/**
 * Staff ghi và xem lịch sử liên hệ với Trustee (ST-10, rule LV-EXT-001), được {@code TrusteeContactController} gọi.
 * Bảng {@code trustees}, {@code trustee_contact_records}; audit {@code TRUSTEE_CONTACT_RECORDED}; mọi thao tác phải thuộc hồ sơ OPEN
 * của Vault được giao cho Staff ({@code StaffVaultCaseGuard}).
 */
@Service
public class TrusteeContactService {

	/**
	 * Truy vấn Trustee.
	 */
	private final TrusteeRepository trustees;
	/**
	 * Lưu / đọc bản ghi liên hệ.
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
	 * Kiểm tra hồ sơ OPEN của Vault được giao cho Staff.
	 */
	private final StaffVaultCaseGuard cases;
	/**
	 * Dùng để refresh Trustee với khóa ghi bi quan.
	 */
	private final EntityManager entities;

	/**
	 * Khởi tạo service với các phụ thuộc do Spring inject.
	 */
	public TrusteeContactService(TrusteeRepository trustees, TrusteeContactRecordRepository records,
			StaffContextService staff, AuditService audit, StaffVaultCaseGuard cases, EntityManager entities) {
		this.trustees = trustees;
		this.records = records;
		this.staff = staff;
		this.audit = audit;
		this.cases = cases;
		this.entities = entities;
	}

	/**
	 * Ghi một kết quả liên hệ Trustee ({@code POST /api/v1/staff/trustees/{trusteeId}/contact-outcomes}).
	 *
	 * Các bước: lấy Staff -> tìm Trustee -> {@code cases.requireOpenForWrite} -> refresh Trustee với PESSIMISTIC_WRITE (nếu đã bị thu hồi trong lúc chờ khóa thì chặn) ->
	 * lưu {@link TrusteeContactRecord} -> audit {@code TRUSTEE_CONTACT_RECORDED}.
	 *
	 * @param trusteeId public id Trustee
	 * @param request kênh, kết quả, trạng thái dự phòng, ghi chú
	 * @return {@link TrusteeContactDtos.RecordResponse}
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND, TRUSTEE_REVOKED, hoặc lỗi guard hồ sơ
	 */
	@Transactional
	public TrusteeContactDtos.RecordResponse record(UUID trusteeId, TrusteeContactDtos.RecordRequest request) {
		User actor = staff.requireStaff();
		Trustee trustee = trustees.findByPublicId(trusteeId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		Long vaultId = trustee.getVault().getVaultId();
		cases.requireOpenForWrite(vaultId, actor.getUserId());
		// Re-read and lock current status after authorization; a revoke may have committed while we waited.
		entities.refresh(trustee, LockModeType.PESSIMISTIC_WRITE);
		if (!vaultId.equals(trustee.getVault().getVaultId())) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
		if ("REVOKED".equals(trustee.getStatus())) {
			throw new BusinessException(ErrorCode.TRUSTEE_REVOKED);
		}
		String note = clean(request.note());
		TrusteeContactRecord record = records.saveAndFlush(new TrusteeContactRecord(trustee, actor.getUserId(),
				request.channel().name(), request.outcome().name(), request.fallbackStatus().name(), note));
		audit.record(actor.getUserId(), trustee.getVault().getVaultId(), "TRUSTEE_CONTACT_RECORDED", "TRUSTEE_CONTACT",
				record.getId(), "USER", Map.of("channel", request.channel().name(), "outcome", request.outcome().name(),
						"fallbackStatus", request.fallbackStatus().name(), "stepId", "ST-10", "ruleId", "LV-EXT-001"));
		return TrusteeContactDtos.RecordResponse.from(record);
	}

	/**
	 * Lịch sử liên hệ của Trustee ({@code GET .../contact-outcomes}), mới nhất trước; yêu cầu hồ sơ OPEN của Vault được giao cho Staff.
	 *
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND hoặc lỗi guard hồ sơ
	 */
	@Transactional(readOnly = true)
	public List<TrusteeContactDtos.RecordResponse> history(UUID trusteeId) {
		User actor = staff.requireStaff();
		Trustee trustee = trustees.findByPublicId(trusteeId)
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		cases.requireOpenForRead(trustee.getVault().getVaultId(), actor.getUserId());
		return records.findAllByTrustee_PublicIdOrderByOccurredAtDesc(trusteeId).stream()
				.map(TrusteeContactDtos.RecordResponse::from).toList();
	}

	/**
	 * Trim; null hoặc rỗng trả về null.
	 */
	private String clean(String value) {
		if (value == null) return null;
		String cleaned = value.trim();
		return cleaned.isEmpty() ? null : cleaned;
	}
}
