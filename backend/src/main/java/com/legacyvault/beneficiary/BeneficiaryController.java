package com.legacyvault.beneficiary;

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
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@Validated
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/beneficiaries")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class BeneficiaryController {

	private final BeneficiaryService service;

	public BeneficiaryController(BeneficiaryService service) {
		this.service = service;
	}

	@PostMapping
	public ResponseEntity<BeneficiaryDtos.Response> create(@PathVariable UUID vaultId,
			@Valid @RequestBody BeneficiaryDtos.UpsertRequest request) {
		BeneficiaryDtos.Response response = service.create(vaultId, request);
		URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{beneficiaryId}")
				.buildAndExpand(response.id()).toUri();
		return ResponseEntity.created(location).body(response);
	}

	@GetMapping
	public PageEnvelope<BeneficiaryDtos.Response> list(@PathVariable UUID vaultId,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
		return service.list(vaultId, page, size);
	}

	@PutMapping("/{beneficiaryId}")
	public BeneficiaryDtos.Response update(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId,
			@Valid @RequestBody BeneficiaryDtos.UpsertRequest request) {
		return service.update(vaultId, beneficiaryId, request);
	}
}
