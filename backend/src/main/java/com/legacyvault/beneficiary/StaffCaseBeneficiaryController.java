package com.legacyvault.beneficiary;

import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** PS-88: Staff-only, read-only discovery of the Beneficiaries of an assigned OPEN case. */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/beneficiaries")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class StaffCaseBeneficiaryController {

	private final CounterBeneficiaryService service;

	public StaffCaseBeneficiaryController(CounterBeneficiaryService service) { this.service = service; }

	@GetMapping
	public ResponseEntity<List<CounterBeneficiaryDtos.Item>> list(@PathVariable UUID caseId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(caseId));
	}

	@GetMapping("/{beneficiaryId}")
	public ResponseEntity<CounterBeneficiaryDtos.Item> get(@PathVariable UUID caseId, @PathVariable UUID beneficiaryId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(caseId, beneficiaryId));
	}
}
