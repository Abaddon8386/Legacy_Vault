package com.legacyvault.auth.dto;

import java.util.List;
import java.util.UUID;

/** Whitelisted public profile data for the authenticated account. */
public record ProfileResponse(UUID id, String fullName, String email, String phoneNumber, List<String> roles) {
}
