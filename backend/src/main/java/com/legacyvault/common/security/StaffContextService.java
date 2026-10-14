package com.legacyvault.common.security;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;

/** Resolves the authenticated staff principal to the internal user key used by persistence and audit. */
@Service
public class StaffContextService {

	private final UserRepository users;

	public StaffContextService(UserRepository users) {
		this.users = users;
	}

	public User requireStaff() {
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
