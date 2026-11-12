package com.legacyvault.common.security;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;

/**
 * Đổi subject của JWT đang đăng nhập (UUID công khai của người dùng) thành bản ghi {@code User} trong bảng
 * {@code users}; được rất nhiều service
 * (vault, asset, will, beneficiary, dms...) gọi để lấy chủ sở hữu hiện tại. {@link StaffContextService} dùng lại
 * lớp này cho nhân viên.
 */
@Service
public class OwnerContextService {

	private final UserRepository users;

	/** Nhận repository người dùng. */
	public OwnerContextService(UserRepository users) {
		this.users = users;
	}

	/**
	 * Lấy người dùng đang đăng nhập từ SecurityContext (tên "owner" là tên cũ, không kiểm tra vai trò).
	 * Lấy UUID công khai từ {@link CustomUserPrincipal} (hoặc từ tên Authentication) rồi tra bảng {@code users}.
	 *
	 * @return thực thể {@link User} đang hoạt động
	 * @throws BusinessException {@code UNAUTHENTICATED} nếu chưa xác thực hoặc tài khoản không {@code ACTIVE}/đã xóa;
	 *                           {@code RESOURCE_NOT_FOUND} nếu không tìm thấy user hoặc subject không phải UUID
	 */
	public User requireOwner() {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication == null || !authentication.isAuthenticated()) {
			throw new BusinessException(ErrorCode.UNAUTHENTICATED);
		}
		try {
			UUID publicId = authentication.getPrincipal() instanceof CustomUserPrincipal principal
					? principal.publicId() : UUID.fromString(authentication.getName());
			User user = users.findByPublicId(publicId)
					.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
			if (user.getDeletedAt() != null || !"ACTIVE".equals(user.getStatus())) {
				throw new BusinessException(ErrorCode.UNAUTHENTICATED);
			}
			return user;
		} catch (IllegalArgumentException ex) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
	}
}
