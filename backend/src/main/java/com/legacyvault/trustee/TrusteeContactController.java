package com.legacyvault.trustee;

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
@RequestMapping("/api/v1/staff/trustees/{trusteeId}/contact-outcomes")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class TrusteeContactController {

	private final TrusteeContactService service;

	public TrusteeContactController(TrusteeContactService service) {
		this.service = service;
	}

	@PostMapping
	public ResponseEntity<TrusteeContactDtos.RecordResponse> record(@PathVariable UUID trusteeId,
			@Valid @RequestBody TrusteeContactDtos.RecordRequest request) {
		TrusteeContactDtos.RecordResponse response = service.record(trusteeId, request);
		return ResponseEntity.created(URI.create("/api/v1/staff/trustees/" + trusteeId
				+ "/contact-outcomes/" + response.id())).body(response);
	}

	@GetMapping
	public List<TrusteeContactDtos.RecordResponse> history(@PathVariable UUID trusteeId) {
		return service.history(trusteeId);
	}
}
