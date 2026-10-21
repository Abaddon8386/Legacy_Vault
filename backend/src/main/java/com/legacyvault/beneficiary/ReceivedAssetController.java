package com.legacyvault.beneficiary;

import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.asset.dto.RevealAssetRequest;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * PS-104: assets Staff handed over to the authenticated Beneficiary account. The account comes only from the principal;
 * there is no recipient, Vault or account id in any path or body. Responses are never cached.
 */
@RestController
@RequestMapping("/api/v1/received-assets")
@PreAuthorize("hasRole('BENEFICIARY')")
public class ReceivedAssetController {

	private final ReceivedAssetService service;

	public ReceivedAssetController(ReceivedAssetService service) {
		this.service = service;
	}

	private static Long account(CustomUserPrincipal principal) {
		return CustomUserPrincipal.requireUserId(principal);
	}

	@GetMapping
	public ResponseEntity<PageResponse<ReceivedAssetDtos.Item>> list(
			@RequestParam(defaultValue = "0") @Min(0) int page, @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return noStore(service.list(account(principal), page, size));
	}

	@GetMapping("/{itemId}")
	public ResponseEntity<ReceivedAssetDtos.Item> get(@PathVariable UUID itemId, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return noStore(service.get(account(principal), itemId));
	}

	@GetMapping("/{itemId}/images")
	public ResponseEntity<List<ReceivedAssetDtos.Image>> images(@PathVariable UUID itemId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return noStore(service.listImages(account(principal), itemId));
	}

	/** POST because the password travels in the body; returns the decrypted asset content once, never cached. */
	@PostMapping("/{itemId}/content")
	public ResponseEntity<ReceivedAssetDtos.Content> content(@PathVariable UUID itemId, @Valid @RequestBody RevealAssetRequest request,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return noStore(service.openContent(account(principal), itemId, request.password()));
	}

	@PostMapping("/{itemId}/images/{imageId}/download")
	public ResponseEntity<byte[]> image(@PathVariable UUID itemId, @PathVariable UUID imageId,
			@Valid @RequestBody RevealAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
		ReceivedAssetDtos.ImageFile file = service.openImage(account(principal), itemId, imageId, request.password());
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(file.contentType()))
				.contentLength(file.content().length)
				.cacheControl(CacheControl.noStore())
				.header("X-Content-Type-Options", "nosniff")
				.header("Content-Security-Policy", "default-src 'none'; sandbox")
				.header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("received-asset-image").build().toString())
				.body(file.content());
	}

	private static <T> ResponseEntity<T> noStore(T body) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
	}
}
