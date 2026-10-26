package com.legacyvault.beneficiary;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@Validated
@RestController
@RequestMapping("/api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class IdentityVerificationController {

	private final IdentityVerificationService service;

	public IdentityVerificationController(IdentityVerificationService service) { this.service = service; }

	@PostMapping
	public ResponseEntity<IdentityVerificationDtos.Response> verify(@PathVariable UUID beneficiaryId,
			@Valid @RequestBody IdentityVerificationDtos.Request request) {
		var response = service.verify(beneficiaryId, request);
		return ResponseEntity.created(URI.create("/api/v1/staff/beneficiaries/" + beneficiaryId
				+ "/identity-verifications/" + response.id())).body(response);
	}

	@GetMapping
	public List<IdentityVerificationDtos.Response> history(@PathVariable UUID beneficiaryId) {
		return service.history(beneficiaryId);
	}
}
