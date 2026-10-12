package com.legacyvault.common.security;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.UserAccount;
import com.legacyvault.user.UserAccountRepository;

/** Resolves the authenticated JWT subject (the user's public UUID) to the internal database key. */
@Service
public class OwnerContextService {

	private final UserAccountRepository users;

	public OwnerContextService(UserAccountRepository users) {
		this.users = users;
	}

	public UserAccount requireOwner() {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication == null || !authentication.isAuthenticated()) {
			throw new BusinessException(ErrorCode.UNAUTHENTICATED);
		}
		try {
			UUID publicId = UUID.fromString(authentication.getName());
			return users.findByPublicIdAndDeletedAtIsNull(publicId)
					.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		} catch (IllegalArgumentException ex) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
	}
}
