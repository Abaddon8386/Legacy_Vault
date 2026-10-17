package com.legacyvault.common.security;

import org.springframework.stereotype.Service;

import com.legacyvault.user.entity.User;

/** Resolves the authenticated actor only. OwnerContextService.requireOwner is a legacy name:
 * it resolves an active JWT user, without checking Owner authority. Controllers enforce Staff role;
 * StaffVaultCaseGuard independently enforces ownership of an OPEN verification case. */
@Service
public class StaffContextService {

	private final OwnerContextService authenticatedUsers;

	public StaffContextService(OwnerContextService authenticatedUsers) {
		this.authenticatedUsers = authenticatedUsers;
	}

	public User requireStaff() {
		// Principal resolution is shared; Staff authority is enforced by the endpoint.
		return authenticatedUsers.requireOwner();
	}
}
