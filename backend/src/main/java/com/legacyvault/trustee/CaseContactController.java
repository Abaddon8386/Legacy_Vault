package com.legacyvault.trustee;

import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Staff-only, read-only contact details of the people to reach on an assigned OPEN case. */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/contacts")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class CaseContactController {

	private final CaseContactService service;

	public CaseContactController(CaseContactService service) {
		this.service = service;
	}

	@GetMapping
	public ResponseEntity<CaseContactDtos.Response> list(@PathVariable UUID caseId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(caseId));
	}
}
