package com.legacyvault.common.security;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditLogRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;

/**
 * Xác nhận lại mật khẩu đăng nhập hiện tại của người dùng trước khi cho xem nội dung bảo mật (D-API-32/33).
 *
 * <p>Sai mật khẩu trả 403 {@code REAUTH_FAILED}, không phải 401: 401 dành cho token thiếu/hết hạn nên FE không được
 * coi đây là phiên đã hết. Mỗi lần sai được ghi audit trong giao dịch riêng (không bị rollback theo giao dịch gọi) và
 * cũng là bộ đếm cho giới hạn: quá {@code max-failed-attempts} lần trong {@code window-minutes} phút thì 429, kể cả khi
 * lần sau nhập đúng. Bộ đếm lấy từ {@code audit_logs} nên không mất khi restart và dùng chung giữa các instance.
 */
@Service
public class PasswordReauthService {

	private final UserRepository userRepository;
	private final PasswordEncoder passwordEncoder;
	private final AuditLogRepository auditLogRepository;
	private final ReauthFailureRecorder failureRecorder;
	private final int maxFailedAttempts;
	private final Duration window;

	public PasswordReauthService(UserRepository userRepository, PasswordEncoder passwordEncoder,
			AuditLogRepository auditLogRepository, ReauthFailureRecorder failureRecorder,
			@Value("${legacyvault.reauth.max-failed-attempts:5}") int maxFailedAttempts,
			@Value("${legacyvault.reauth.window-minutes:15}") int windowMinutes) {
		if (maxFailedAttempts < 1 || windowMinutes < 1) {
			throw new IllegalArgumentException("Invalid reauth configuration");
		}
		this.userRepository = userRepository;
		this.passwordEncoder = passwordEncoder;
		this.auditLogRepository = auditLogRepository;
		this.failureRecorder = failureRecorder;
		this.maxFailedAttempts = maxFailedAttempts;
		this.window = Duration.ofMinutes(windowMinutes);
	}

	/**
	 * @param userId   người đang đăng nhập (từ principal, không lấy từ request)
	 * @param vaultId  Vault đang truy cập, chỉ để ghi audit
	 * @throws BusinessException {@code TOO_MANY_ATTEMPTS} (429) hoặc {@code REAUTH_FAILED} (403)
	 */
	public void requirePassword(Long userId, Long vaultId, String rawPassword) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
		if (!"ACTIVE".equals(user.getStatus()) || user.getDeletedAt() != null) {
			throw new BusinessException(ErrorCode.UNAUTHENTICATED);
		}

		LocalDateTime since = LocalDateTime.now(ZoneOffset.UTC).minus(window);
		long failures = auditLogRepository.countByActorUserIdAndActionAndOccurredAtAfter(userId,
				AuditAction.REAUTH_FAILED.name(), since);
		// Kiểm tra giới hạn trước khi so mật khẩu: người đang bị khóa không dùng được endpoint này để dò tiếp.
		if (failures >= maxFailedAttempts) {
			throw new BusinessException(ErrorCode.TOO_MANY_ATTEMPTS);
		}

		if (!user.isPasswordLoginAllowed() || rawPassword == null || !passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
			failureRecorder.record(userId, vaultId);
			throw new BusinessException(ErrorCode.REAUTH_FAILED);
		}
	}
}
