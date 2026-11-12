package com.legacyvault.common.security;

import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;

/**
 * Ghi audit lần nhập sai mật khẩu xác nhận trong giao dịch riêng ({@code REQUIRES_NEW}) để vẫn được lưu khi giao dịch
 * gọi bị rollback do ném {@code REAUTH_FAILED}. Tách bean riêng vì tự gọi trong cùng class không đi qua proxy.
 * Được {@link PasswordReauthService} gọi.
 */
@Component
public class ReauthFailureRecorder {

	private final AuditService auditService;

	/** Nhận {@link AuditService} để ghi sự kiện. */
	public ReauthFailureRecorder(AuditService auditService) {
		this.auditService = auditService;
	}

	/**
	 * Ghi audit {@code REAUTH_FAILED} (actor USER, entity {@code USER}, lý do {@code INVALID_PASSWORD}, step
	 * {@code REAUTH}) vào bảng {@code audit_logs} trong transaction mới.
	 *
	 * @param userId  người nhập sai
	 * @param vaultId két đang truy cập (có thể null)
	 */
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public void record(Long userId, Long vaultId) {
		auditService.record(new AuditEvent(AuditAction.REAUTH_FAILED, AuditActorType.USER, userId, vaultId, "USER",
				userId, null, null, null, Map.of("result", "FAILURE", "reason", "INVALID_PASSWORD"), "REAUTH", null));
	}
}
