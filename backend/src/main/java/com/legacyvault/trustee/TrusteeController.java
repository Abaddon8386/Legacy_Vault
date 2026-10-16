package com.legacyvault.trustee;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.legacyvault.common.api.PageEnvelope;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

@Validated
@RestController
@RequestMapping("/api/v1/trustees")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class TrusteeController {

	private final TrusteeService service;

	public TrusteeController(TrusteeService service) {
		this.service = service;
	}

	@PostMapping
	public ResponseEntity<TrusteeDtos.Response> create(@Valid @RequestBody TrusteeDtos.CreateRequest request) {
		TrusteeDtos.Response response = service.create(request);
		URI location = ServletUriComponentsBuilder.fromCurrentContextPath().path("/api/v1/trustees")
				.queryParam("vaultId", response.vaultId()).build().toUri();
		return ResponseEntity.created(location).body(response);
	}

	@GetMapping
	public PageEnvelope<TrusteeDtos.Response> current(@RequestParam @NotNull UUID vaultId) {
		return service.current(vaultId);
	}

	@PutMapping("/{trusteeId}")
	public TrusteeDtos.Response update(@PathVariable UUID trusteeId,
			@Valid @RequestBody TrusteeDtos.UpdateRequest request) {
		return service.update(trusteeId, request);
	}

	@PostMapping("/{trusteeId}/revoke")
	public TrusteeDtos.Response revoke(@PathVariable UUID trusteeId) {
		return service.revoke(trusteeId);
	}
}
