package com.legacyvault.common.security;

import org.springframework.stereotype.Service;

import com.legacyvault.user.entity.User;

/**
 * Resolves the authenticated actor only. OwnerContextService.requireOwner is a legacy name:
 * it resolves an active JWT user, without checking Owner authority. Controllers enforce Staff role;
 * StaffVaultCaseGuard independently enforces ownership of an OPEN verification case.
 *
 * <p>Được các service của nhân viên (staff executor / legal verifier) gọi để lấy người dùng đang đăng nhập.
 */
@Service
public class StaffContextService {

	/** Dịch vụ dùng chung để xác định người dùng đang đăng nhập. */
	private final OwnerContextService authenticatedUsers;

	/** Nhận {@link OwnerContextService}. */
	public StaffContextService(OwnerContextService authenticatedUsers) {
		this.authenticatedUsers = authenticatedUsers;
	}

	/**
	 * Trả về người dùng đang đăng nhập cho luồng nhân viên. Không tự kiểm tra role: quyền staff được endpoint bắt buộc.
	 *
	 * @return {@link User} đang hoạt động
	 * @throws com.legacyvault.common.error.BusinessException {@code UNAUTHENTICATED} hoặc {@code RESOURCE_NOT_FOUND}
	 *         như {@link OwnerContextService#requireOwner()}
	 */
	public User requireStaff() {
		// Principal resolution is shared; Staff authority is enforced by the endpoint.
		return authenticatedUsers.requireOwner();
	}
}
