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
 *
 * <p>Được các service hiển thị nội dung bảo mật (ví dụ mở tài sản, xem file di chúc) gọi; ghi audit qua
 * {@link ReauthFailureRecorder} và đếm bằng {@code AuditLogRepository}.
 */
@Service
public class PasswordReauthService {

	/** Tra cứu người dùng (bảng {@code users}) để lấy hash mật khẩu. */
	private final UserRepository userRepository;
	/** Bộ so khớp mật khẩu BCrypt. */
	private final PasswordEncoder passwordEncoder;
	/** Dùng đếm số lần {@code REAUTH_FAILED} gần đây trong bảng {@code audit_logs}. */
	private final AuditLogRepository auditLogRepository;
	/** Ghi audit sai mật khẩu trong transaction riêng. */
	private final ReauthFailureRecorder failureRecorder;
	/** Số lần sai tối đa trong cửa sổ trước khi bị khóa (cấu hình {@code legacyvault.reauth.max-failed-attempts}, mặc định 5). */
	private final int maxFailedAttempts;
	/** Độ dài cửa sổ đếm lần sai (cấu hình {@code legacyvault.reauth.window-minutes}, mặc định 15 phút). */
	private final Duration window;

	/**
	 * Khởi tạo service với giới hạn thử sai.
	 *
	 * @throws IllegalArgumentException nếu số lần tối đa hoặc số phút của cửa sổ nhỏ hơn 1
	 */
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
	 * Yêu cầu người dùng nhập đúng mật khẩu hiện tại. Các bước: tải user (phải {@code ACTIVE}, chưa xóa); từ chối nếu
	 * là tài khoản chỉ đăng nhập Google chưa đặt mật khẩu; đếm số lần {@code REAUTH_FAILED} trong cửa sổ và chặn nếu
	 * đã đạt giới hạn (kiểm tra trước khi so mật khẩu); so mật khẩu bằng BCrypt, sai thì ghi audit và ném lỗi.
	 *
	 * @param userId      người đang đăng nhập (từ principal, không lấy từ request)
	 * @param vaultId     Vault đang truy cập, chỉ để ghi audit
	 * @param rawPassword mật khẩu người dùng nhập
	 * @throws BusinessException {@code UNAUTHENTICATED} (user không tồn tại/không hoạt động),
	 *                           {@code PASSWORD_NOT_SET} (tài khoản Google chưa đặt mật khẩu),
	 *                           {@code TOO_MANY_ATTEMPTS} (429) hoặc {@code REAUTH_FAILED} (403)
	 */
	public void requirePassword(Long userId, Long vaultId, String rawPassword) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
		if (!"ACTIVE".equals(user.getStatus()) || user.getDeletedAt() != null) {
			throw new BusinessException(ErrorCode.UNAUTHENTICATED);
		}
		// Google-only account: there is no password to confirm yet. Tell the client to set one, and do not
		// record a failure, so this never counts toward the wrong-password limit.
		if (!user.isPasswordLoginAllowed()) {
			throw new BusinessException(ErrorCode.PASSWORD_NOT_SET);
		}

		LocalDateTime since = LocalDateTime.now(ZoneOffset.UTC).minus(window);
		long failures = auditLogRepository.countByActorUserIdAndActionAndOccurredAtAfter(userId,
				AuditAction.REAUTH_FAILED.name(), since);
		// Kiểm tra giới hạn trước khi so mật khẩu: người đang bị khóa không dùng được endpoint này để dò tiếp.
		if (failures >= maxFailedAttempts) {
			throw new BusinessException(ErrorCode.TOO_MANY_ATTEMPTS);
		}

		if (rawPassword == null || !passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
			failureRecorder.record(userId, vaultId);
			throw new BusinessException(ErrorCode.REAUTH_FAILED);
		}
	}
}
