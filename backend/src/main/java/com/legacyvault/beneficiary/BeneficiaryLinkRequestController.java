package com.legacyvault.beneficiary;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.common.security.CustomUserPrincipal;

import jakarta.validation.Valid;

/** BE-01: any signed-in account (a Beneficiary role is not required) manages its own link requests. */
@RestController
@RequestMapping("/api/v1/beneficiary-link-requests")
@PreAuthorize("isAuthenticated()")
public class BeneficiaryLinkRequestController {

	private final BeneficiaryLinkRequestService service;

	public BeneficiaryLinkRequestController(BeneficiaryLinkRequestService service) { this.service = service; }

	@PostMapping
	public ResponseEntity<BeneficiaryLinkRequestDtos.MyRequest> submit(
			@Valid @RequestBody BeneficiaryLinkRequestDtos.SubmitRequest request,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		var created = service.submit(CustomUserPrincipal.requireUserId(principal), request.caseCode());
		return ResponseEntity.created(URI.create("/api/v1/beneficiary-link-requests/" + created.requestId()))
				.cacheControl(CacheControl.noStore()).body(created);
	}

	@GetMapping
	public ResponseEntity<List<BeneficiaryLinkRequestDtos.MyRequest>> listMine(
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(service.listMine(CustomUserPrincipal.requireUserId(principal)));
	}

	@PostMapping("/{requestId}/cancel")
	public ResponseEntity<BeneficiaryLinkRequestDtos.MyRequest> cancel(@PathVariable UUID requestId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(service.cancel(CustomUserPrincipal.requireUserId(principal), requestId));
	}
}
