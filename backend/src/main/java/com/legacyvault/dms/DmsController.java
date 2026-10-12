package com.legacyvault.dms;

import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@Validated
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/dms")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class DmsController {

	private final DmsService service;

	public DmsController(DmsService service) {
		this.service = service;
	}

	@PutMapping
	public DmsDtos.Response configure(@PathVariable UUID vaultId,
			@Valid @RequestBody DmsDtos.ConfigureRequest request) {
		return service.configure(vaultId, request);
	}

	@GetMapping
	public DmsDtos.Response get(@PathVariable UUID vaultId) {
		return service.get(vaultId);
	}

	@PostMapping("/check-in")
	public DmsDtos.Response checkIn(@PathVariable UUID vaultId) {
		return service.checkIn(vaultId);
	}
}
