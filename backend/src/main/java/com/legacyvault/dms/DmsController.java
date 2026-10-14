package com.legacyvault.dms;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@Validated
@RestController
@RequestMapping("/api/v1/dms")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class DmsController {

	private final DmsService service;

	public DmsController(DmsService service) {
		this.service = service;
	}

	@PutMapping
	public DmsDtos.Response configure(@Valid @RequestBody DmsDtos.ConfigureRequest request) {
		return service.configure(request);
	}

	@GetMapping
	public DmsDtos.Response get() {
		return service.get();
	}

	@PostMapping("/check-in")
	public DmsDtos.Response checkIn() {
		return service.checkIn();
	}
}
