package com.legacyvault.beneficiary;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

/** PS-106: Staff records an in-person identity check for a Beneficiary in their assigned OPEN case. */
@Validated
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/identity-attestations")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class CounterIdentityAttestationController {
	private final CounterIdentityAttestationService service;

	public CounterIdentityAttestationController(CounterIdentityAttestationService service) {
		this.service = service;
	}

	@PostMapping
	public ResponseEntity<CounterIdentityAttestationDtos.Response> attest(@PathVariable UUID caseId,
			@PathVariable UUID beneficiaryId, @Valid @RequestBody CounterIdentityAttestationDtos.Request request) {
		var response = service.attest(caseId, beneficiaryId, request);
		return ResponseEntity.status(201).body(response);
	}
}
