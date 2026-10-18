package com.legacyvault.beneficiary;

import java.net.URI;
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

/** PS-62 / PS-63 (ST-24): only Staff Executor, and only for a case they own (checked in the service). */
@Validated
@RestController
@RequestMapping("/api/v1/staff/beneficiaries/{beneficiaryId}")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class StaffBeneficiaryAccountController {

	private final BeneficiaryAccountService service;

	public StaffBeneficiaryAccountController(BeneficiaryAccountService service) { this.service = service; }

	@PostMapping("/account-link")
	public BeneficiaryAccountDtos.Response link(@PathVariable UUID beneficiaryId,
			@Valid @RequestBody BeneficiaryAccountDtos.LinkRequest request) {
		return service.link(beneficiaryId, request);
	}

	@PostMapping("/account")
	public ResponseEntity<BeneficiaryAccountDtos.Response> create(@PathVariable UUID beneficiaryId,
			@Valid @RequestBody BeneficiaryAccountDtos.CreateRequest request) {
		var response = service.create(beneficiaryId, request);
		return ResponseEntity.created(URI.create("/api/v1/staff/beneficiaries/" + beneficiaryId + "/account"))
				.body(response);
	}
}
