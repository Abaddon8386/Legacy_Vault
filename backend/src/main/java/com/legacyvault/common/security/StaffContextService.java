package com.legacyvault.common.security;

import org.springframework.stereotype.Service;

import com.legacyvault.user.entity.User;

/** Resolves the authenticated staff principal to the internal user key used by persistence and audit. */
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
